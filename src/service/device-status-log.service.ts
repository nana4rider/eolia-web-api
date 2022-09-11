import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EoliaOperationMode, EoliaStatus } from 'panasonic-eolia-ts';
import { Repository } from 'typeorm';
import { DeviceStatusLog } from '../entity/device-status-log.entity';
import { EoliaService } from './eolia.service';

@Injectable()
export class DeviceStatusLogService {
  constructor(
    @InjectRepository(DeviceStatusLog)
    private readonly deviceStatusLogRepository: Repository<DeviceStatusLog>,
  ) {}

  async getLastActiveStatus(deviceId: number): Promise<EoliaStatus | null> {
    return this.getLastStatus(deviceId, ...EoliaService.MODES_ACTIVE);
  }

  async getLastStatus(
    deviceId: number,
    ...modes: EoliaOperationMode[]
  ): Promise<EoliaStatus | null> {
    const deviceLog = await this.deviceStatusLogRepository
      .createQueryBuilder('log')
      .select('log.data')
      .where('log.device.deviceId = :deviceId', { deviceId })
      .andWhere('log.operationMode IN (:...modes)', { modes })
      .orderBy('log.updated_at', 'DESC')
      .limit(1)
      .getOne();

    return deviceLog?.data ?? null;
  }
}
