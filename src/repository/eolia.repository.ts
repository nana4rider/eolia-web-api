import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EoliaClient, EoliaDevice, EoliaStatus } from 'panasonic-eolia-ts';

@Injectable()
export class EoliaRepository implements OnModuleInit {
  private client: EoliaClient;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const config = this.configService.get<{
      userId: string;
      password: string;
    }>('eolia.auth');
    if (!config) {
      throw new Error('Eolia config error');
    }

    const { userId, password } = config;
    this.client = new EoliaClient(userId, password);
    await this.client.login();
  }

  async getStatus(applianceId: string): Promise<EoliaStatus> {
    const status = await this.client.getDeviceStatus(applianceId);

    return status;
  }

  async setStatus(status: EoliaStatus): Promise<EoliaStatus> {
    const operation = await this.client.createOperation(status);

    return this.client.setDeviceStatus(operation);
  }

  async getDevices(): Promise<EoliaDevice[]> {
    const eoliaDevices = await this.client.getDevices();

    return eoliaDevices;
  }
}
