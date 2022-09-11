import { Injectable, NotFoundException, PipeTransform } from '@nestjs/common';
import { Device } from '../entity/device.entity';
import { DeviceService } from '../service/device.service';

@Injectable()
export class DevicePipe implements PipeTransform<number, Promise<Device>> {
  constructor(private readonly deviceService: DeviceService) {}

  async transform(deviceId: number) {
    const device = await this.deviceService.findOne(deviceId);

    if (!device) {
      throw new NotFoundException();
    }

    return device;
  }
}
