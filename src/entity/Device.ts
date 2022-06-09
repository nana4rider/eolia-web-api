import { DateTime } from 'luxon';
import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import { DateTimeTransformer } from 'typeorm-util-ts';
import { DeviceStatusLog } from './DeviceStatusLog';

@Entity()
@Unique(['applianceId'])
export class Device {
  @PrimaryGeneratedColumn({ type: 'integer' })
  id!: number;

  @Column('text')
  applianceId!: string;

  @Column('text', { nullable: true })
  token!: string;

  @Column('datetime', { transformer: DateTimeTransformer.instance, nullable: true })
  tokenExpire!: DateTime | null;

  @Column('text')
  deviceName!: string;

  @CreateDateColumn({ transformer: DateTimeTransformer.instance, select: false })
  readonly createdAt!: DateTime;

  @UpdateDateColumn({ transformer: DateTimeTransformer.instance, select: false })
  readonly updatedAt!: DateTime;

  @OneToMany(
    () => DeviceStatusLog,
    deviceStatusLog => deviceStatusLog.device
  )
  deviceStatusLogs?: Promise<DeviceStatusLog[]>;
}
