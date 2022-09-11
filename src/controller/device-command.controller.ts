import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Put,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { DeviceCommandBodyDto } from '../dto/device-command.body.dto';
import { Device } from '../entity/device.entity';
import { DevicePipe } from '../pipe/device.pipe';
import { EoliaService } from '../service/eolia.service';

@Controller('devices')
@ApiTags('command')
export class DeviceCommandController {
  constructor(private readonly eoliaService: EoliaService) {}

  @ApiResponse({ status: HttpStatus.NO_CONTENT })
  @ApiOperation({
    summary: 'デバイスを同期',
    description: 'デバイスの情報をクラウドと同期します',
  })
  @Put(':deviceId/command/sync')
  @HttpCode(HttpStatus.NO_CONTENT)
  async synchronize(): Promise<void> {
    await this.eoliaService.synchronize();
  }

  @ApiParam({
    name: 'deviceId',
    description: 'Device ID',
    required: true,
    type: Number,
  })
  @ApiResponse({ status: HttpStatus.ACCEPTED })
  @ApiOperation({ summary: '更新情報を送信' })
  @Post(':deviceId/command/send')
  @HttpCode(HttpStatus.ACCEPTED)
  sendStatus(
    @Param('deviceId', ParseIntPipe, DevicePipe)
    device: Device,
    @Body() data: DeviceCommandBodyDto,
  ): void {
    void this.eoliaService.setStatus(device, data);
  }

  @ApiParam({
    name: 'deviceId',
    description: 'Device ID',
    required: true,
    type: Number,
  })
  @ApiResponse({ status: HttpStatus.ACCEPTED })
  @ApiOperation({ summary: '温湿度を元に、運転モードを自動判断します' })
  @Post(':deviceId/command/auto')
  @HttpCode(HttpStatus.ACCEPTED)
  automaticJudgment(
    @Param('deviceId', ParseIntPipe, DevicePipe)
    device: Device,
  ): void {
    void this.eoliaService.automaticJudgment(device);
  }
}
