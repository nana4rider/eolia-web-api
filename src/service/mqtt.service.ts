import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  EoliaAirFlow,
  EoliaClient,
  EoliaStatus,
  EoliaTimerValue,
  EoliaWindDirection,
  EoliaWindDirectionHorizon,
} from 'panasonic-eolia-ts';
import { DeviceCommandBodyDto } from '../dto/device-command.body.dto';
import {
  EoliaMqttProperty,
  MqttRepository,
} from '../repository/mqtt.repository';
@Injectable()
export class MqttService implements OnModuleInit {
  private readonly logger = new Logger(MqttService.name);

  private readonly parsers = new Map<
    EoliaMqttProperty,
    (value: string) => DeviceCommandBodyDto
  >();

  private readonly converters = new Map<
    EoliaMqttProperty,
    (status: EoliaStatus) => string
  >();

  constructor(private readonly mqttRepository: MqttRepository) {}

  onModuleInit() {
    // MQTT HVAC preset_mode_command_topic
    this.parsers.set('preset_mode', this.parseMqttPresetMode);
    // MQTT HVAC mode_command_topic
    this.parsers.set('mode', this.parseMqttMode);
    // MQTT HVAC temperature_command_topic
    this.parsers.set('temperature', this.parseMqttTemperature);
    // MQTT HVAC fan_mode_command_topic
    this.parsers.set('fan_mode', this.parseMqttFanMode);
    // MQTT HVAC swing_mode_command_topic
    this.parsers.set('swing_mode', this.parseMqttSwingMode);
    // MQTT Switch
    this.parsers.set('power', this.parseMqttPower);
    // MQTT Switch
    this.parsers.set('nanoex', this.parseMqttNanoex);
    // MQTT Select
    this.parsers.set('wind_direction', this.parseMqttWindDirection);
    // MQTT Select
    this.parsers.set(
      'wind_direction_horizon',
      this.parseMqttWindDirectionHorizon,
    );
    // MQTT Select
    this.parsers.set('off_timer', this.parseMqttOffTimer);

    // MQTT HVAC preset_mode_state_topic
    this.converters.set('preset_mode', this.toMqttPresetMode);
    // MQTT HVAC mode_state_topic
    this.converters.set('mode', this.toMqttMode);
    // MQTT HVAC temperature_state_topic
    this.converters.set('temperature', this.toMqttTemperature);
    // MQTT HVAC fan_mode_state_topic
    this.converters.set('fan_mode', this.toMqttFanMode);
    // MQTT HVAC swing_mode_state_topic
    this.converters.set('swing_mode', this.toMqttSwingMode);
    // MQTT Switch
    this.converters.set('power', this.toMqttPower);
    // MQTT Switch
    this.converters.set('nanoex', this.toMqttNanoex);
    // MQTT Select
    this.converters.set('wind_direction', this.toMqttWindDirection);
    // MQTT Select
    this.converters.set(
      'wind_direction_horizon',
      this.toMqttWindDirectionHorizon,
    );
    // MQTT Select
    this.converters.set('off_timer', this.toMqttOffTimer);
    // MQTT Sensor
    this.converters.set('current_temperature', this.toMqttCurrentTemperature);
    // MQTT Sensor
    this.converters.set('current_humidity', this.toMqttCurrentHumidity);
    // MQTT Sensor
    this.converters.set('outside_temperature', this.toMqttOutsideTemperature);
  }

  async addCommandListener(
    callback: (deviceId: number, data: DeviceCommandBodyDto) => void,
  ): Promise<void> {
    return this.mqttRepository.addCommandListener(
      (deviceId: number, property: EoliaMqttProperty, value: string) => {
        const parser = this.parsers.get(property);
        if (!parser) {
          this.logger.warn(
            `This property is not allowed to be updated. ${property}`,
          );
          return;
        }

        try {
          const data = parser(value);
          callback(deviceId, data);
        } catch (err) {
          this.logger.warn(`Parse error. ${property}: ${value}`);
        }
      },
    );
  }

  async publishState(deviceId: number, status: EoliaStatus): Promise<void> {
    await Promise.all(
      Array.from(this.converters.entries()).map(async ([property, getter]) =>
        this.mqttRepository.publishState(deviceId, property, getter(status)),
      ),
    );
  }

  // parsers

  private parseMqttPresetMode(value: string): DeviceCommandBodyDto {
    if (value === 'cleaning') {
      return { operation_mode: 'Cleaning' };
    } else if (value === 'away') {
      return { operation_mode: 'NanoexCleaning' };
    } else if (value === 'eco') {
      return { ai_control: 'comfortable_econavi' };
    } else if (value === 'comfort') {
      return { ai_control: 'comfortable' };
    } else if (value === 'none') {
      return { ai_control: 'off' };
    }
    throw new Error();
  }

  private parseMqttMode(value: string): DeviceCommandBodyDto {
    if (value === 'auto') {
      return { operation_mode: 'Auto' };
    } else if (value === 'cool') {
      return { operation_mode: 'Cooling' };
    } else if (value === 'heat') {
      return { operation_mode: 'Heating' };
    } else if (value === 'dry') {
      return { operation_mode: 'CoolDehumidifying' };
    } else if (value === 'fan_only') {
      return { operation_mode: 'Nanoe' };
    } else if (value === 'off') {
      return { operation_mode: 'Stop' };
    }
    throw new Error();
  }

  private parseMqttTemperature(value: string): DeviceCommandBodyDto {
    return { temperature: Number(value) };
  }

  private parseMqttFanMode(value: string): DeviceCommandBodyDto {
    if (
      ((value: any): value is EoliaAirFlow => EoliaAirFlow.includes(value))(
        value,
      ) &&
      value !== 'not_set'
    ) {
      return { air_flow: value };
    }

    if (value === '1') {
      return { wind_volume: 2 };
    } else if (value === '2') {
      return { wind_volume: 3 };
    } else if (value === '3') {
      return { wind_volume: 4 };
    } else if (value === '4') {
      return { wind_volume: 5 };
    } else if (value === 'auto') {
      return { wind_volume: 0 };
    }
    throw new Error();
  }

  private parseMqttSwingMode(value: string): DeviceCommandBodyDto {
    if (value === 'on') {
      return { wind_direction: 0 };
    } else if (value === 'off') {
      return { wind_direction: 3 };
    }
    throw new Error();
  }

  private parseMqttPower(value: string): DeviceCommandBodyDto {
    if (value === 'ON') {
      return { operation_status: true };
    } else if (value === 'OFF') {
      return { operation_status: false };
    }
    throw new Error();
  }

  private parseMqttNanoex(value: string): DeviceCommandBodyDto {
    if (value === 'ON') {
      return { nanoex: true };
    } else if (value === 'OFF') {
      return { nanoex: false };
    }
    throw new Error();
  }

  private parseMqttWindDirection(value: string): DeviceCommandBodyDto {
    if (value === 'auto') {
      return { wind_direction: 0 };
    }

    const n = Number(value);
    if (
      ((n: any): n is EoliaWindDirection => EoliaWindDirection.includes(n))(n)
    ) {
      return { wind_direction: n };
    }

    throw new Error();
  }

  private parseMqttWindDirectionHorizon(value: string): DeviceCommandBodyDto {
    if (
      ((value: any): value is EoliaWindDirectionHorizon =>
        EoliaWindDirectionHorizon.includes(value))(value)
    ) {
      return { wind_direction_horizon: value };
    }

    throw new Error();
  }

  private parseMqttOffTimer(value: string): DeviceCommandBodyDto {
    if (value === 'off') {
      return { timer_value: 0 };
    }

    const matcher = value.match(/^(\d+)min/);
    if (!matcher) {
      throw new Error();
    }

    const n = Number(matcher[1]);
    if (((n: any): n is EoliaTimerValue => EoliaTimerValue.includes(n))(n)) {
      return { timer_value: n };
    }

    throw new Error();
  }

  // converters

  private toMqttPresetMode(status: EoliaStatus): string {
    // Eolia attr → Home Assistant attr
    if (status.operation_mode === 'Cleaning') {
      return 'cleaning'; // おそうじ → cleaning(custom)
    } else if (status.operation_mode === 'NanoexCleaning') {
      return 'away'; // おでかけクリーン → 外出
    } else if (!status.operation_status) {
      return 'none'; // 電源OFF → なし
    } else if (status.ai_control === 'comfortable') {
      return 'comfort'; // AI快適 → 快適さ
    } else if (status.ai_control === 'comfortable_econavi') {
      return 'eco'; // AIエコナビ → エコ
    } else {
      return 'none'; // その他 → なし
    }
  }

  private toMqttMode(status: EoliaStatus): string {
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
  }

  private toMqttTemperature(status: EoliaStatus): string {
    if (
      status.operation_status &&
      EoliaClient.isTemperatureSupport(status.operation_mode)
    ) {
      return String(status.temperature);
    } else {
      return '0';
    }
  }

  private toMqttFanMode(status: EoliaStatus): string {
    if (status.air_flow !== 'not_set') {
      return status.air_flow;
    }

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
  }

  private toMqttSwingMode(status: EoliaStatus): string {
    return status.wind_direction === 0 ? 'on' : 'off';
  }

  private toMqttPower(status: EoliaStatus): string {
    return status.operation_status ? 'ON' : 'OFF';
  }

  private toMqttNanoex(status: EoliaStatus): string {
    return status.nanoex ? 'ON' : 'OFF';
  }

  private toMqttWindDirection(status: EoliaStatus): string {
    return status.wind_direction === 0 ? 'auto' : String(status.wind_direction);
  }

  private toMqttWindDirectionHorizon(status: EoliaStatus): string {
    return status.wind_direction_horizon;
  }

  private toMqttOffTimer(status: EoliaStatus): string {
    return status.timer_value === 0 ? 'off' : `${status.timer_value}min`;
  }

  private toMqttCurrentTemperature(status: EoliaStatus): string {
    return String(status.inside_temp);
  }

  private toMqttCurrentHumidity(status: EoliaStatus): string {
    return String(status.inside_humidity);
  }

  private toMqttOutsideTemperature(status: EoliaStatus): string {
    return status.outside_temp === 999
      ? 'unknown'
      : String(status.outside_temp);
  }
}
