import config from 'config';
import * as log4js from 'log4js';
import * as mqtt from 'mqtt';
import { IClientPublishOptions } from 'mqtt';
import { EoliaStatus } from 'panasonic-eolia-ts';
import { getRepository } from 'typeorm';
import { Device } from '../entity/Device';
import { getDevice, getEoliaStatus, powerOff, powerOn, updateEoliaStatus } from './common';

const logger = log4js.getLogger();

const mqttClient = mqtt.connect(config.get('mqtt.broker'));

const SUBSCRIBE_TOPIC_NAMES = [
  'power',
  'preset',
  'mode',
  'temperature',
  'fan_mode',
  'swing_mode',
  'wind_direction',
  'wind_direction_horizon'
];

async function initMqtt() {
  return new Promise<void>((resolve, reject) => {
    mqttClient.on('connect', async () => {
      const devices = await getRepository(Device).find();

      devices.forEach(device => subscribeMqtt(device.id));

      resolve();
    });

    mqttClient.on('message', receiveMqtt);
  });
}

function subscribeMqtt(deviceId: number) {
  mqttClient.subscribe(SUBSCRIBE_TOPIC_NAMES.map(name => `eolia/${deviceId}/${name}/set`), async err => {
    if (err) {
      logger.error(err);
    }
  });
}

function unsubscribeMqtt(device: Device) {
  mqttClient.unsubscribe(SUBSCRIBE_TOPIC_NAMES.map(name => `eolia/${device.id}/${name}/set`));
}

function publishMqtt(device: Device, status: EoliaStatus) {
  const topicBase = `eolia/${device.id}`;
  const options: IClientPublishOptions = { qos: 1, retain: true };

  // MQTT HVAC current_temperature_topic
  mqttClient.publish(`${topicBase}/current_temperature/get`, String(status.inside_temp), options);

  // MQTT Sensor 湿度計
  mqttClient.publish(`${topicBase}/current_humidity/get`, String(status.inside_humidity), options);

  // MQTT Switch 電源
  mqttClient.publish(`${topicBase}/power/get`, status.operation_status ? 'ON' : 'OFF', options);

  // MQTT HVAC preset_mode_state_topic
  mqttClient.publish(`${topicBase}/preset_mode/get`, (() => {
    if (status.ai_control === 'comfortable_econavi') {
      return 'eco';
    } else if (status.air_flow === 'powerful') {
      return 'boost';
    } else if (status.air_flow === 'quiet') {
      return 'sleep';
    } else {
      return 'comfort';
    }
  })(), options);

  // MQTT HVAC mode_state_topic
  mqttClient.publish(`${topicBase}/mode/get`, (() => {
    switch (status.operation_mode) {
    case 'Auto': // 自動
      return 'auto';
    case 'Cooling': // 冷房
      return 'cool';
    case 'Heating': // 暖房
      return 'heat';
    case 'CoolDehumidifying': // 冷房除湿
    case 'ComfortableDehumidification': // 除湿
    case 'ClothesDryer': // 衣類乾燥
      return 'dry';
    case 'Blast': // 送風
    case 'Nanoe': // ナノイー
      return 'fan_only';
    default: // off、掃除、その他
      return 'off';
    }
  })(), options);

  // MQTT HVAC temperature_state_topic
  mqttClient.publish(`${topicBase}/temperature/get`, String(status.temperature), options);

  // MQTT HVAC fan_mode_state_topic
  mqttClient.publish(`${topicBase}/fan_mode/get`, (() => {
    switch (status.wind_volume) {
    case 2:
      return 'low';
    case 3:
      return 'medium';
    case 4:
    case 5:
      return 'high';
    default:
      return 'auto';
    }
  })(), options);

  // MQTT HVAC swing_mode_state_topic
  mqttClient.publish(`${topicBase}/swing_mode/get`, status.wind_direction === 0 ? 'on' : 'off', options);

  // MQTT Select
  mqttClient.publish(`${topicBase}/wind_direction/get`, String(status.wind_direction), options);

  // MQTT Select
  mqttClient.publish(`${topicBase}/wind_direction_horizon/get`, status.wind_direction_horizon, options);
}

async function receiveMqtt(topic: string, payload: Buffer, packet: mqtt.IPublishPacket): Promise<void> {
  const topicMatcher = topic.match(/^eolia\/(\d+)\/(\w+)\/set$/);
  if (!topicMatcher) {
    logger.error(topic);
    return;
  }

  const message = payload.toString();
  const deviceId = Number(topicMatcher[1]);
  const command = topicMatcher[2];

  const device = await getDevice(deviceId);
  if (!device) {
    logger.warn('deviceId:', deviceId);
    return;
  }
  const status = await getEoliaStatus(device);

  if (!status.operation_status && command !== 'power' && command !== 'mode') {
    // 電源OFF時はpowerとmodeのみ利用できる
    return;
  }

  if (command === 'power') {
    // MQTT HVAC power_command_topic
    if (message === 'ON') {
      await powerOn(device, status);
    } else if (message === 'OFF') {
      await powerOff(device, status);
    }
  } else if (command === 'preset') {
    // MQTT HVAC preset_mode_command_topic
    if (message === 'eco') {
      if (status.air_flow !== 'not_set') {
        status.air_flow = 'not_set';
        status.wind_volume = 0;
      }
      status.ai_control = 'comfortable_econavi';
    } else if (message === 'boost') {
      status.air_flow = 'powerful';
      status.wind_volume = 0;
    } else if (message === 'sleep') {
      status.air_flow = 'quiet';
      status.wind_volume = 0;
    } else if (message === 'comfort') {
      if (status.air_flow !== 'not_set') {
        status.air_flow = 'not_set';
        status.wind_volume = 0;
      }
      status.ai_control = 'comfortable';
      status.nanoex = true;
    } else {
      return;
    }

    await updateEoliaStatus(device, status);
  } else if (command === 'mode') {
    // MQTT HVAC mode_command_topic
    if (message === 'auto') {
      status.operation_mode = 'Auto'; // 自動
    } else if (message === 'cool') {
      status.operation_mode = 'Cooling'; // 冷房
    } else if (message === 'heat') {
      status.operation_mode = 'Heating'; // 暖房
    } else if (message === 'dry') {
      status.operation_mode = 'CoolDehumidifying'; // 冷房除湿
    } else if (message === 'fan_only') {
      status.operation_mode = 'Blast'; // 送風
    } else if (message === 'off') {
      await powerOff(device, status);
      return;
    } else {
      return;
    }

    status.operation_status = true;

    await updateEoliaStatus(device, status);
  } else if (command === 'temperature') {
    // MQTT HVAC temperature_command_topic
    status.temperature = Number(message);

    await updateEoliaStatus(device, status);
  } else if (command === 'fan_mode') {
    // MQTT HVAC fan_mode_command_topic
    if (message === 'low') {
      status.wind_volume = 2;
    } else if (message === 'medium') {
      status.wind_volume = 3;
    } else if (message === 'high') {
      status.wind_volume = 4;
    } else if (message === 'auto') {
      status.wind_volume = 0;
    } else {
      return;
    }

    await updateEoliaStatus(device, status);
  } else if (command === 'swing_mode') {
    // MQTT HVAC swing_mode_command_topic
    if (message === 'on') {
      status.wind_direction = 0;
    } else if (message === 'off') {
      status.wind_direction = 3;
    } else {
      return;
    }

    await updateEoliaStatus(device, status);
  } else if (command === 'wind_direction') {
    // MQTT Select
    const windDirection = Number(message);

    if (windDirection === 0 || windDirection === 1 || windDirection === 2
        || windDirection === 3 || windDirection === 4 || windDirection === 5) {
      status.wind_direction = windDirection;
      await updateEoliaStatus(device, status);
    }
  } else if (command === 'wind_direction_horizon') {
    // MQTT Select
    const windDirectionHorizon = message;
    if (windDirectionHorizon === 'auto' || windDirectionHorizon === 'nearby_left' || windDirectionHorizon === 'to_left'
        || windDirectionHorizon === 'to_right' || windDirectionHorizon === 'nearby_right' || windDirectionHorizon === 'front') {
      status.wind_direction_horizon = windDirectionHorizon;
      await updateEoliaStatus(device, status);
    }
  }
}

export {
  initMqtt, subscribeMqtt, unsubscribeMqtt, publishMqtt, receiveMqtt
};

