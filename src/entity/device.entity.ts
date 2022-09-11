import { ApiProperty } from '@nestjs/swagger';
import { DateTime } from 'luxon';
import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { DateTimeTransformer } from 'typeorm-util-ts';
import { DeviceStatusLog } from './device-status-log.entity';

@Entity()
@Unique(['applianceId'])
export class Device {
  @ApiProperty()
  @PrimaryGeneratedColumn({ type: 'integer' })
  deviceId!: number;

  @ApiProperty()
  @Column('text')
  applianceId!: string;

  @ApiProperty()
  @Column('text')
  deviceName!: string;

  @Column('text', { nullable: true })
  token!: string | null;

  @Column('datetime', {
    transformer: DateTimeTransformer.instance,
    nullable: true,
  })
  tokenExpire!: DateTime | null;

  @CreateDateColumn({
    transformer: DateTimeTransformer.instance,
    select: false,
  })
  readonly createdAt!: DateTime;

  @UpdateDateColumn({
    transformer: DateTimeTransformer.instance,
    select: false,
  })
  readonly updatedAt!: DateTime;

  @OneToMany(() => DeviceStatusLog, (deviceStatusLog) => deviceStatusLog.device)
  deviceStatusLogs?: Promise<DeviceStatusLog[]>;
}
