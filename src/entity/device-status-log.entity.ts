import { DateTime } from 'luxon';
import { EoliaOperationMode, EoliaStatus } from 'panasonic-eolia-ts';
import {
  BeforeInsert,
  BeforeUpdate,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { DateTimeTransformer } from 'typeorm-util-ts';
import { Device } from './device.entity';

@Entity()
@Unique(['device.deviceId', 'operationMode'])
export class DeviceStatusLog {
  @PrimaryGeneratedColumn({ type: 'integer' })
  deviceStatusLogId!: number;

  @Column({ type: 'varchar', length: 20 })
  operationMode!: EoliaOperationMode;

  @Column('json')
  data!: EoliaStatus;

  @CreateDateColumn({
    transformer: DateTimeTransformer.instance,
    select: false,
  })
  readonly createdAt!: DateTime;

  @UpdateDateColumn({
    transformer: DateTimeTransformer.instance,
    select: false,
  })
  readonly updatedAt?: number;

  @BeforeInsert()
  @BeforeUpdate()
  beforeUpsert() {
    this.operationMode = this.data.operation_mode;
  }

  @ManyToOne(() => Device, (device) => device.deviceStatusLogs, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn([{ name: 'deviceId', referencedColumnName: 'deviceId' }])
  device!: Device;
}
