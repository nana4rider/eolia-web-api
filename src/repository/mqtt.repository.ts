import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import mqtt, { AsyncMqttClient, IClientOptions, QoS } from 'async-mqtt';

const EoliaMqttPropertyNames = [
  'preset_mode',
  'mode',
  'temperature',
  'fan_mode',
  'swing_mode',
  'power',
  'nanoex',
  'wind_direction',
  'wind_direction_horizon',
  'off_timer',
  'current_temperature',
  'current_humidity',
  'outside_temperature',
] as const;

export type EoliaMqttProperty = typeof EoliaMqttPropertyNames[number];

@Injectable()
export class MqttRepository implements OnModuleInit {
  private readonly logger = new Logger(MqttRepository.name);

  private client: AsyncMqttClient;

  private baseTopic: string;

  private qos: QoS;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    const config = this.configService.get<IClientOptions>('mqtt.broker');

    this.client = await mqtt.connectAsync(config);
    this.logger.log('MQTT Connected');

    this.qos = this.configService.get<QoS>('mqtt.qos') ?? 1;
    this.baseTopic =
      this.configService.get<string>('mqtt.baseTopic') ?? 'eolia-web-api';

    await this.client.subscribe(`${this.baseTopic}/+/+/set`, { qos: this.qos });
  }

  publishState(
    deviceId: number,
    property: EoliaMqttProperty,
    value: string,
  ): Promise<void> {
    return this.client.publish(
      `${this.baseTopic}/${deviceId}/${property}/get`,
      value,
      { retain: true, qos: 0 },
    );
  }

  async addCommandListener(
    callback: (
      deviceId: number,
      property: EoliaMqttProperty,
      value: string,
    ) => void,
  ): Promise<void> {
    this.client.on('message', (recvTopic, payload) => {
      const pattern = new RegExp(`${this.baseTopic}/(\\d+)/(\\w+)/set`);
      const matcher = recvTopic.match(pattern);
      if (!matcher) return;

      const deviceId = Number(matcher[1]);
      const property = matcher[2];

      if (!this.isProperty(property)) return;

      callback(deviceId, property, payload.toString());
    });
  }

  private isProperty(name: any): name is EoliaMqttProperty {
    return EoliaMqttPropertyNames.includes(name);
  }
}
