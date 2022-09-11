import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeviceCommandController } from '../controller/device-command.controller';
import { DeviceController } from '../controller/device.controller';
import { DeviceStatusLog } from '../entity/device-status-log.entity';
import { Device } from '../entity/device.entity';
import { EoliaRepository } from '../repository/eolia.repository';
import { MqttRepository } from '../repository/mqtt.repository';
import { DeviceStatusLogService } from '../service/device-status-log.service';
import { DeviceService } from '../service/device.service';
import { EoliaService } from '../service/eolia.service';
import { MqttService } from '../service/mqtt.service';
@Module({
  imports: [TypeOrmModule.forFeature([Device, DeviceStatusLog])],
  providers: [
    DeviceService,
    DeviceStatusLogService,
    EoliaService,
    MqttService,
    EoliaRepository,
    MqttRepository,
  ],
  controllers: [DeviceController, DeviceCommandController],
})
export class DeviceModule implements NestModule {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-empty-function
  configure(consumer: MiddlewareConsumer) {}
}
