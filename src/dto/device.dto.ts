import { ApiProperty } from '@nestjs/swagger';
import { EoliaOperationMode, EoliaStatus } from 'panasonic-eolia-ts';
import { EoliaService } from '../service/eolia.service';

export class DeviceListDto {
  @ApiProperty({ description: 'デバイスID' })
  deviceId: number;

  @ApiProperty({ description: '機器ID' })
  applianceId: string;

  @ApiProperty({ description: 'デバイス名' })
  deviceName: string;
}

export class DeviceDetailDto extends DeviceListDto {
  @ApiProperty({ description: 'Eoliaステータス' })
  status: EoliaStatus;

  @ApiProperty({
    description: '最終運転モード',
    enum: EoliaService.MODES_ACTIVE,
  })
  lastMode: EoliaOperationMode | null;
}
