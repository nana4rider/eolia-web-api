import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import {
  EoliaAiControl,
  EoliaAirFlow,
  EoliaClient,
  EoliaOperation,
  EoliaOperationMode,
  EoliaTimerValue,
  EoliaWindDirection,
  EoliaWindDirectionHorizon,
  EoliaWindVolume,
} from 'panasonic-eolia-ts';

export class DeviceCommandBodyDto
  implements
    Partial<
      Omit<EoliaOperation, 'appliance_id' | 'operation_token' | 'airquality'>
    >
{
  @ApiPropertyOptional({ description: '状態' })
  @IsOptional()
  @IsBoolean()
  operation_status?: boolean;

  @ApiPropertyOptional({ description: 'ナノイーX' })
  @IsOptional()
  @IsBoolean()
  nanoex?: boolean;

  @ApiPropertyOptional({ description: '風量', enum: EoliaWindVolume })
  @IsOptional()
  @IsIn(EoliaWindVolume)
  wind_volume?: EoliaWindVolume;

  @ApiPropertyOptional({ description: '風量オプション', enum: EoliaAirFlow })
  @IsOptional()
  @IsIn(EoliaAirFlow)
  air_flow?: EoliaAirFlow;

  @ApiPropertyOptional({ description: '風向き上下', enum: EoliaWindDirection })
  @IsOptional()
  @IsIn(EoliaWindDirection)
  wind_direction?: EoliaWindDirection;

  @ApiPropertyOptional({
    description: '風向き左右',
    enum: EoliaWindDirectionHorizon,
  })
  @IsOptional()
  @IsIn(EoliaWindDirectionHorizon)
  wind_direction_horizon?: EoliaWindDirectionHorizon;

  @ApiPropertyOptional({ description: '切タイマー', enum: EoliaTimerValue })
  @IsOptional()
  @IsIn(EoliaTimerValue)
  timer_value?: EoliaTimerValue;

  @ApiPropertyOptional({ description: '運転モード', enum: EoliaOperationMode })
  @IsOptional()
  @IsIn(EoliaOperationMode)
  operation_mode?: EoliaOperationMode;

  @ApiPropertyOptional({ description: '設定温度' })
  @IsOptional()
  @IsNumber()
  @Min(EoliaClient.MIN_TEMPERATURE)
  @Max(EoliaClient.MAX_TEMPERATURE)
  temperature?: number;

  @ApiPropertyOptional({ description: 'AIコントロール', enum: EoliaAiControl })
  @IsOptional()
  @IsIn(EoliaAiControl)
  ai_control?: EoliaAiControl;
}
