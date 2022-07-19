import config from 'config';
import * as log4js from 'log4js';
import * as mqtt from 'mqtt';
import { IClientPublishOptions } from 'mqtt';
import { EoliaClient, EoliaStatus } from 'panasonic-eolia-ts';
import { getRepository } from 'typeorm';
import { Device } from '../entity/Device';
import { DeviceStatusLog } from '../entity/DeviceStatusLog';
import { getDevice, getEoliaStatus, powerOff, powerOn, updateEoliaStatus } from './common';

const logger = log4js.getLogger();

let mqttClient: mqtt.Client | undefined = undefined;

const SUBSCRIBE_TOPIC_NAMES = [
  'power',
  'preset_mode',
  'mode',
  'temperature',
  'fan_mode',
  'swing_mode',
  'nanoex',
  'wind_direction',
  'wind_direction_horizon',
  'off_timer',
];

async function initMqtt() {
  return new Promise<void>((resolve, reject) => {
    mqttClient = mqtt.connect(config.get('mqtt.broker'));

    mqttClient.on('connect', async () => {
      const devices = await getRepository(Device).find();

      devices.forEach(device => subscribeMqtt(device.id));

      resolve();
    });

    mqttClient.on('message', receiveMqtt);
  });
}

function subscribeMqtt(deviceId: number) {
  if (!mqttClient) throw new Error('Not initialized');

  mqttClient.subscribe(SUBSCRIBE_TOPIC_NAMES.map(name => `eolia/${deviceId}/${name}/set`), async err => {
    if (err) {
      logger.error(err);
    }
  });
}

function unsubscribeMqtt(device: Device) {
  if (!mqttClient) throw new Error('Not initialized');

  mqttClient.unsubscribe(SUBSCRIBE_TOPIC_NAMES.map(name => `eolia/${device.id}/${name}/set`));
}

function publishMqtt(device: Device, status: EoliaStatus) {
  if (!mqttClient) throw new Error('Not initialized');

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
    if (status.operation_mode === 'NanoexCleaning') {
      return 'away';
    } else if (!status.operation_status) {
      return 'none';
    } else if (status.ai_control === 'comfortable_econavi') {
      return 'eco';
    } else if (status.air_flow === 'powerful') {
      return 'boost';
    } else if (status.air_flow === 'quiet') {
      return 'sleep';
    } else if (status.ai_control === 'comfortable') {
      return 'comfort';
    } else {
      return 'none';
    }
  })(), options);

  // MQTT HVAC mode_state_topic
  mqttClient.publish(`${topicBase}/mode/get`, (() => {
    if (!status.operation_status) {
      return 'off';
    }

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
  mqttClient.publish(`${topicBase}/temperature/get`,
    status.operation_status && EoliaClient.isTemperatureSupport(status.operation_mode)
      ? String(status.temperature) : '0', options);

  // MQTT HVAC fan_mode_state_topic
  mqttClient.publish(`${topicBase}/fan_mode/get`, (() => {
    switch (status.wind_volume) {
    case 2:
      return '1';
    case 3:
      return '2';
    case 4:
      return '3';
    case 5:
      return '4';
    default:
      return 'auto';
    }
  })(), options);

  // MQTT HVAC swing_mode_state_topic
  mqttClient.publish(`${topicBase}/swing_mode/get`, status.wind_direction === 0 ? 'on' : 'off', options);

  // MQTT Select
  mqttClient.publish(`${topicBase}/nanoex/get`, status.nanoex ? 'ON' : 'OFF', options);

  // MQTT Select
  mqttClient.publish(`${topicBase}/wind_direction/get`, status.wind_direction === 0 ? 'auto' : String(status.wind_direction), options);

  // MQTT Select
  mqttClient.publish(`${topicBase}/wind_direction_horizon/get`, status.wind_direction_horizon, options);

  // MQTT Select
  mqttClient.publish(`${topicBase}/off_timer/get`, status.timer_value === 0 ? 'off' : String(status.timer_value) + 'min', options);
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

  if (!status.operation_status
    && !(
      command === 'power' || command === 'mode' || (command === 'preset_mode' && message === 'away')
    )) {
    // 電源OFF時はpowerとmodeのみ利用できる
    return;
  }

  if (command === 'preset_mode') {
    // MQTT HVAC preset_mode_command_topic
    if (message === 'away') {
      status.operation_mode = 'NanoexCleaning';
      status.operation_status = false;
    } else if (message === 'eco') {
      if (status.air_flow !== 'not_set') {
        status.air_flow = 'not_set';
        status.wind_volume = 0;
      }
      status.ai_control = 'comfortable_econavi';
    } else if (message === 'boost') {
      status.air_flow = 'powerful';
      status.wind_volume = 0;
      status.ai_control = 'off';
    } else if (message === 'sleep') {
      status.air_flow = 'quiet';
      status.wind_volume = 0;
    } else if (message === 'comfort') {
      if (status.air_flow !== 'not_set') {
        status.air_flow = 'not_set';
        status.wind_volume = 0;
      }
      status.ai_control = 'comfortable';
    } else if (message === 'none') {
      status.ai_control = 'off';
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

    const deviceLog = await getRepository(DeviceStatusLog).findOne({
      where: { device, operationMode: status.operation_mode },
      order: { updatedAt: 'DESC' },
    });
    if (deviceLog) {
      status.temperature = deviceLog.data.temperature;
    }

    await updateEoliaStatus(device, status);
  } else if (command === 'temperature') {
    // MQTT HVAC temperature_command_topic
    if (!EoliaClient.isTemperatureSupport(status.operation_mode)) return;

    status.temperature = Number(message);

    await updateEoliaStatus(device, status);
  } else if (command === 'fan_mode') {
    // MQTT HVAC fan_mode_command_topic
    if (message === '1') {
      status.wind_volume = 2;
      status.air_flow = 'not_set';
    } else if (message === '2') {
      status.wind_volume = 3;
      status.air_flow = 'not_set';
    } else if (message === '3') {
      status.wind_volume = 4;
      status.air_flow = 'not_set';
    } else if (message === '4') {
      status.wind_volume = 5;
      status.air_flow = 'not_set';
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
  } else if (command === 'power') {
    // MQTT Switch 電源
    if (message === 'ON') {
      await powerOn(device, status);
    } else if (message === 'OFF') {
      await powerOff(device, status);
    }
  } else if (command === 'nanoex') {
    // MQTT Select
    status.nanoex = message === 'ON';
    await updateEoliaStatus(device, status);
  } else if (command === 'wind_direction') {
    // MQTT Select
    const windDirection = message === 'auto' ? 0 : Number(message);

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
  } else if (command === 'off_timer') {
    // MQTT Select
    const offTimer = message === 'off' ? 0 : parseInt(message);
    if (offTimer === 0 || offTimer === 30 || offTimer === 60 || offTimer === 90 || offTimer === 120) {
      status.timer_value = offTimer;
      await updateEoliaStatus(device, status);
    }
  }
}

export {
  initMqtt, subscribeMqtt, unsubscribeMqtt, publishMqtt, receiveMqtt
};

