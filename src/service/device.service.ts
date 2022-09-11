import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Device } from '../entity/device.entity';

@Injectable()
export class DeviceService {
  constructor(
    @InjectRepository(Device)
    private readonly deviceRepository: Repository<Device>,
  ) {}

  find(): Promise<Device[]> {
    return this.deviceRepository.find();
  }

  findOne(deviceId: number): Promise<Device | null> {
    return this.deviceRepository.findOne({ where: { deviceId } });
  }

  findByApplianceId(applianceId: string): Promise<Device | null> {
    return this.deviceRepository.findOne({ where: { applianceId } });
  }
}
