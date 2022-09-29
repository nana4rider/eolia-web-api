import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import assert from 'assert';
import deepEqual from 'deep-equal';
import { DateTime } from 'luxon';
import {
  EoliaClient,
  EoliaDevice,
  EoliaOperationMode,
  EoliaStatus,
} from 'panasonic-eolia-ts';
import { DataSource, EntityManager, InsertResult } from 'typeorm';
import { DeviceCommandBodyDto } from '../dto/device-command.body.dto';
import { DeviceStatusLog } from '../entity/device-status-log.entity';
import { Device } from '../entity/device.entity';
import { EoliaRepository } from '../repository/eolia.repository';
import { DeviceStatusLogService } from './device-status-log.service';
import { DeviceService } from './device.service';
import { MqttService } from './mqtt.service';

@Injectable()
export class EoliaService implements OnApplicationBootstrap {
  private readonly logger = new Logger(EoliaService.name);

  public static readonly MODES_ACTIVE: EoliaOperationMode[] = [
    'Auto',
    'Cooling',
    'Heating',
    'CoolDehumidifying',
    'ComfortableDehumidification',
    'ClothesDryer',
    'Blast',
    'Nanoe',
  ];

  public static readonly MODES_CLEANING: EoliaOperationMode[] = [
    'NanoexCleaning',
    'Cleaning',
  ];

  public static readonly REFRESH_INTERVAL = 3_600_000;

  constructor(
    private readonly eoliaRepository: EoliaRepository,
    private readonly deviceService: DeviceService,
    private readonly deviceStatusLogService: DeviceStatusLogService,
    private readonly mqttService: MqttService,
    private readonly dataSource: DataSource,
  ) {}

  async onApplicationBootstrap() {
    await this.mqttService.addCommandListener(
      async (deviceId: number, data: DeviceCommandBodyDto) => {
        const device = await this.deviceService.findOne(deviceId);
        if (!device) {
          this.logger.warn(`Device not found. deviceId: ${deviceId}`);
          return;
        }

        await this.setStatus(device, data);
      },
    );

    setInterval(async () => {
      const devices = await this.deviceService.find();
      devices.forEach((device) => this.getStatus(device));
    }, EoliaService.REFRESH_INTERVAL);
  }

  /**
   * 状態を取得
   *
   * @param device
   * @param manager
   * @returns
   */
  async getStatus(
    device: Device,
    manager?: EntityManager,
  ): Promise<EoliaStatus> {
    if (!manager) {
      return this.dataSource.transaction<EoliaStatus>(async (manager) =>
        this.getStatus(device, manager),
      );
    }

    const { deviceId } = device;

    // ロック中であれば、ロック解放後にログを利用できるので待つ
    device = await manager.findOneOrFail(Device, {
      where: { deviceId },
      lock: { mode: 'pessimistic_write' },
    });

    const { tokenExpire } = device;

    let status: EoliaStatus;
    if (tokenExpire && tokenExpire.diffNow().milliseconds >= 0) {
      // トークンの期限が有効である場合、他端末で更新できないのでDBの値を利用する
      // ※リモコンやECHONET Liteを使わない前提。APIの呼び出し回数削減のために実装。
      const deviceLog = await manager
        .createQueryBuilder(DeviceStatusLog, 'log')
        .select()
        .where('log.device.deviceId = :deviceId', { deviceId })
        .orderBy('log.updated_at', 'DESC')
        .limit(1)
        .getOneOrFail();

      status = deviceLog.data;

      if (status.operation_token !== device.token) {
        throw new Error('Token does not match.');
      }
    } else {
      // トークンが無効である場合、APIから最新の情報を取得し、MQTT配信する
      status = await this.eoliaRepository.getStatus(device.applianceId);

      void this.mqttService.publishState(deviceId, status);

      const deviceLog = manager.create(DeviceStatusLog, {
        device: { deviceId },
        operationMode: status.operation_mode,
        data: status,
      });

      await this.saveDeviceLog(manager, deviceLog);
    }

    return status;
  }

  private async setStatusInner(
    device: Device,
    status: EoliaStatus,
    manager: EntityManager,
  ): Promise<void> {
    const { deviceId } = device;
    if (device.applianceId !== status.appliance_id) {
      throw new Error(`invalid applianceId: ${status.appliance_id}`);
    }

    device = await manager.findOneOrFail(Device, {
      where: { deviceId },
      lock: { mode: 'pessimistic_write' },
    });

    void this.mqttService.publishState(deviceId, status); // 更新APIが遅いので、更新前にも配信

    status = await this.eoliaRepository.setStatus(status);

    void this.mqttService.publishState(deviceId, status);

    const operationMode = status.operation_mode;

    device.token = status.operation_token;
    device.tokenExpire = DateTime.local().plus(
      EoliaClient.OPERATION_TOKEN_LIFETIME,
    );

    await manager.save(device);

    const deviceLog = manager.create(DeviceStatusLog, {
      device: { deviceId },
      operationMode,
      data: status,
    });

    await this.saveDeviceLog(manager, deviceLog);
  }

  private async saveDeviceLog(
    manager: EntityManager,
    deviceLog: DeviceStatusLog,
  ): Promise<InsertResult> {
    return manager
      .createQueryBuilder()
      .insert()
      .orUpdate(['data'])
      .into(DeviceStatusLog)
      .values(deviceLog)
      .updateEntity(false)
      .execute();
  }

  /**
   * クラウドの機器一覧を取得
   *
   * @returns
   */
  getEoliaDevices(): Promise<EoliaDevice[]> {
    return this.eoliaRepository.getDevices();
  }

  /**
   * デバイスの情報をクラウドと同期
   */
  async synchronize(): Promise<void> {
    const eoliaDevices = await this.getEoliaDevices();

    await this.dataSource.transaction(async (manager) => {
      const newDevices: Device[] = [];

      for (const eoliaDevice of eoliaDevices) {
        const applianceId = eoliaDevice.appliance_id;
        let device = await this.deviceService.findByApplianceId(applianceId);
        const isNew = !device;

        if (!device) {
          device = manager.create(Device, {
            applianceId,
          });
        }

        device.deviceName = eoliaDevice.nickname;
        await manager.save(device);

        if (isNew) {
          newDevices.push(device);
        }
      }

      await Promise.all(
        newDevices.map((device) => this.getStatus(device, manager)),
      );
    });
  }

  /**
   * 状態を設定
   *
   * @param device
   * @param updateData
   */
  async setStatus(
    device: Device,
    updateData: DeviceCommandBodyDto,
  ): Promise<void> {
    if (Object.keys(updateData).length === 0) return;

    const { deviceId } = device;

    await this.dataSource.transaction(async (manager) => {
      const currentStatus = await this.getStatus(device, manager);

      if (updateData.operation_mode !== undefined) {
        // モード指定あり
        if (
          currentStatus.operation_mode === 'Stop' &&
          updateData.operation_mode === 'Stop'
        ) {
          return;
        }

        // 温度設定とAIコントロールは、モードごとに保持している値を使う
        if (EoliaClient.isTemperatureSupport(updateData.operation_mode)) {
          const lastStatus = await this.deviceStatusLogService.getLastStatus(
            deviceId,
            updateData.operation_mode,
          );

          if (updateData.temperature === undefined) {
            updateData.temperature = lastStatus?.temperature ?? 20;
          }

          if (updateData.ai_control === undefined) {
            updateData.ai_control = lastStatus?.ai_control ?? 'comfortable';
          }
        }

        // 状態はモードから自動決定
        updateData.operation_status = EoliaService.MODES_ACTIVE.includes(
          updateData.operation_mode,
        );
      } else {
        // モード指定なし
        if (updateData.operation_status === undefined) {
          updateData.operation_status = currentStatus.operation_status;
        }

        if (currentStatus.operation_status) {
          // ON → ON or OFF
          updateData.operation_mode = currentStatus.operation_mode;
        } else {
          if (updateData.operation_status === true) {
            // OFF → ON
            const lastActiveStatus =
              await this.deviceStatusLogService.getLastActiveStatus(deviceId);

            // 前回のモードで起動する
            if (lastActiveStatus) {
              updateData.operation_mode = lastActiveStatus.operation_mode;
              if (updateData.temperature === undefined) {
                updateData.temperature = lastActiveStatus.temperature;
              }
              if (updateData.ai_control === undefined) {
                updateData.ai_control = lastActiveStatus.ai_control;
              }
            } else {
              updateData.operation_mode = 'Auto';
              if (updateData.temperature === undefined) {
                updateData.temperature = 20;
              }
              if (updateData.ai_control === undefined) {
                updateData.ai_control = 'comfortable';
              }
            }
          } else {
            // OFF → OFF
            return;
          }
        }
      }

      if (updateData.operation_mode === 'Stop') {
        updateData.operation_mode = 'Auto';
      } else if (updateData.operation_mode === 'Nanoe') {
        updateData.operation_mode = 'Blast';
        updateData.nanoex = true;
      }

      assert(updateData.operation_mode !== undefined);
      assert(updateData.operation_status !== undefined);

      if (
        updateData.wind_volume !== undefined &&
        updateData.ai_control === undefined &&
        currentStatus.ai_control === 'off'
      ) {
        // 風量指定時、AIコントロールの指定がなければAI快適をつけておく(独自ルール)
        updateData.ai_control = 'comfortable';
      }

      if (!EoliaClient.isTemperatureSupport(updateData.operation_mode)) {
        // 設定温度、AI未サポート
        delete updateData.temperature;
        updateData.ai_control = 'off';
      }

      if (
        updateData.air_flow !== undefined &&
        updateData.air_flow !== 'not_set'
      ) {
        // パワフルや静かは、風量とAIの指定ができない
        updateData.wind_volume = 0;
        updateData.ai_control = 'off';
      } else if (updateData.wind_volume !== undefined) {
        // 風量設定時は、風量オプションを設定できない
        updateData.air_flow = 'not_set';
      }

      const updateStatus = Object.assign({}, currentStatus, updateData);

      if (!deepEqual(currentStatus, updateStatus)) {
        await this.setStatusInner(device, updateStatus, manager);
      }
    });
  }

  /**
   * 温湿度を元に、運転モードを自動判断
   *
   * @param device
   */
  async automaticJudgment(device: Device): Promise<void> {
    const status = await this.getStatus(device);
    if (status.operation_status) {
      return;
    }

    let operationMode: EoliaOperationMode | undefined = undefined;
    const now = DateTime.local();

    const coolingFrom = DateTime.local(now.year, 6, 16);
    const coolingTo = DateTime.local(now.year, 9, 15);
    const heating1From = DateTime.local(now.year, 1, 1);
    const heating1To = DateTime.local(now.year, 3, 31);
    const heating2From = DateTime.local(now.year, 11, 1);
    const heating2To = DateTime.local(now.year, 12, 31);

    if (now >= coolingFrom && now <= coolingTo) {
      // 夏
      if (status.inside_temp > 28) {
        // 湿度が高い場合は冷房除湿
        if (status.inside_humidity >= 75) {
          operationMode = 'CoolDehumidifying';
        } else {
          operationMode = 'Cooling';
        }
      }
    } else if (
      (now >= heating1From && now <= heating1To) ||
      (now >= heating2From && now <= heating2To)
    ) {
      // 冬
      if (status.inside_temp < 20) {
        operationMode = 'Heating';
      }
    }

    if (operationMode) {
      await this.setStatus(device, { operation_mode: operationMode });
    }
  }
}
