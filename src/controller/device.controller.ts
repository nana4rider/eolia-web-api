import {
  Controller,
  Get,
  HttpStatus,
  Param,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { EoliaStatus } from 'panasonic-eolia-ts';
import { DeviceDetailDto, DeviceListDto } from '../dto/device.dto';
import { Device } from '../entity/device.entity';
import { DevicePipe } from '../pipe/device.pipe';
import { DeviceStatusLogService } from '../service/device-status-log.service';
import { DeviceService } from '../service/device.service';
import { EoliaService } from '../service/eolia.service';

@Controller('devices')
@ApiTags('device')
export class DeviceController {
  constructor(
    private readonly deviceService: DeviceService,
    private readonly deviceStatusLogService: DeviceStatusLogService,
    private readonly eoliaService: EoliaService,
  ) {}

  @ApiResponse({
    status: HttpStatus.OK,
    type: DeviceListDto,
    isArray: true,
  })
  @ApiOperation({ summary: 'デバイスの一覧を取得' })
  @Get()
  async index(): Promise<DeviceListDto[]> {
    const devices = await this.deviceService.find();

    return devices.map(({ deviceId, applianceId, deviceName }) => ({
      deviceId,
      applianceId,
      deviceName,
    }));
  }

  @ApiParam({
    name: 'deviceId',
    description: 'Device ID',
    required: true,
    type: Number,
  })
  @ApiResponse({ status: HttpStatus.OK, type: DeviceDetailDto })
  @ApiOperation({ summary: 'デバイスの詳細を取得' })
  @Get(':deviceId')
  async findOne(
    @Param('deviceId', ParseIntPipe, DevicePipe)
    device: Device,
  ): Promise<DeviceDetailDto> {
    const { deviceId, applianceId, deviceName } = device;
    const status = await this.eoliaService.getStatus(device);

    const lastActiveStatus: EoliaStatus | null =
      await this.deviceStatusLogService.getLastActiveStatus(deviceId);

    return {
      deviceId,
      applianceId,
      deviceName,
      status,
      lastMode: lastActiveStatus?.operation_mode ?? null,
    };
  }
}
