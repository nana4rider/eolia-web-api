import { DateTime } from 'luxon';
import { EoliaStatus } from 'panasonic-eolia-ts';
import { BeforeInsert, BeforeUpdate, Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import { DateTimeTransformer } from 'typeorm-util-ts';
import { Device } from './Device';

@Entity()
@Unique(['device.id', 'operationMode'])
export class DeviceStatusLog {
  @PrimaryGeneratedColumn({ type: 'integer' })
  id!: number;

  @Column('text')
  operationMode!: string;

  @Column('simple-json')
  data!: EoliaStatus;

  @CreateDateColumn({ transformer: DateTimeTransformer.instance, select: false })
  readonly createdAt!: DateTime;

  @UpdateDateColumn({ transformer: DateTimeTransformer.instance, select: false })
  readonly updatedAt?: DateTime;

  @BeforeInsert()
  @BeforeUpdate()
  beforeUpsert() {
    this.operationMode = this.data.operation_mode;
  }

  @ManyToOne(
    () => Device,
    device => device.deviceStatusLogs,
    { onDelete: 'CASCADE', nullable: false }
  )
  @JoinColumn([{ referencedColumnName: 'id' }])
  device!: Device;
}
