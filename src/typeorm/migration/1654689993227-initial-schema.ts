import { MigrationInterface, QueryRunner } from "typeorm";

export class initialSchema1654689993227 implements MigrationInterface {
    name = 'initialSchema1654689993227'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "device_status_logs" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "operation_mode" text NOT NULL, "data" text NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "device_id" integer NOT NULL, CONSTRAINT "UQ_9687c7c0fc7903ea206ecd1633a" UNIQUE ("device_id", "operation_mode"))`);
        await queryRunner.query(`CREATE TABLE "devices" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "appliance_id" text NOT NULL, "token" text, "token_expire" datetime, "device_name" text NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_f226cbd88a25958eb4d68d39ecd" UNIQUE ("appliance_id"))`);
        await queryRunner.query(`CREATE TABLE "temporary_device_status_logs" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "operation_mode" text NOT NULL, "data" text NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "device_id" integer NOT NULL, CONSTRAINT "UQ_9687c7c0fc7903ea206ecd1633a" UNIQUE ("device_id", "operation_mode"), CONSTRAINT "FK_bc4aec398e2ef230de08f06fb02" FOREIGN KEY ("device_id") REFERENCES "devices" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`);
        await queryRunner.query(`INSERT INTO "temporary_device_status_logs"("id", "operation_mode", "data", "created_at", "updated_at", "device_id") SELECT "id", "operation_mode", "data", "created_at", "updated_at", "device_id" FROM "device_status_logs"`);
        await queryRunner.query(`DROP TABLE "device_status_logs"`);
        await queryRunner.query(`ALTER TABLE "temporary_device_status_logs" RENAME TO "device_status_logs"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "device_status_logs" RENAME TO "temporary_device_status_logs"`);
        await queryRunner.query(`CREATE TABLE "device_status_logs" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "operation_mode" text NOT NULL, "data" text NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "device_id" integer NOT NULL, CONSTRAINT "UQ_9687c7c0fc7903ea206ecd1633a" UNIQUE ("device_id", "operation_mode"))`);
        await queryRunner.query(`INSERT INTO "device_status_logs"("id", "operation_mode", "data", "created_at", "updated_at", "device_id") SELECT "id", "operation_mode", "data", "created_at", "updated_at", "device_id" FROM "temporary_device_status_logs"`);
        await queryRunner.query(`DROP TABLE "temporary_device_status_logs"`);
        await queryRunner.query(`DROP TABLE "devices"`);
        await queryRunner.query(`DROP TABLE "device_status_logs"`);
    }

}
