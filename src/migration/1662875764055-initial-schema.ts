import { MigrationInterface, QueryRunner } from "typeorm";

export class initialSchema1662875764055 implements MigrationInterface {
    name = 'initialSchema1662875764055'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE \`devices\` (\`device_id\` int NOT NULL AUTO_INCREMENT, \`appliance_id\` text NOT NULL, \`device_name\` text NOT NULL, \`token\` text NULL, \`token_expire\` datetime NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), UNIQUE INDEX \`IDX_f226cbd88a25958eb4d68d39ec\` (\`appliance_id\`), PRIMARY KEY (\`device_id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`device_status_logs\` (\`device_status_log_id\` int NOT NULL AUTO_INCREMENT, \`operation_mode\` varchar(20) NOT NULL, \`data\` json NOT NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`device_id\` int NOT NULL, UNIQUE INDEX \`IDX_9687c7c0fc7903ea206ecd1633\` (\`device_id\`, \`operation_mode\`), PRIMARY KEY (\`device_status_log_id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`ALTER TABLE \`device_status_logs\` ADD CONSTRAINT \`FK_bc4aec398e2ef230de08f06fb02\` FOREIGN KEY (\`device_id\`) REFERENCES \`devices\`(\`device_id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`device_status_logs\` DROP FOREIGN KEY \`FK_bc4aec398e2ef230de08f06fb02\``);
        await queryRunner.query(`DROP INDEX \`IDX_9687c7c0fc7903ea206ecd1633\` ON \`device_status_logs\``);
        await queryRunner.query(`DROP TABLE \`device_status_logs\``);
        await queryRunner.query(`DROP INDEX \`IDX_f226cbd88a25958eb4d68d39ec\` ON \`devices\``);
        await queryRunner.query(`DROP TABLE \`devices\``);
    }

}
