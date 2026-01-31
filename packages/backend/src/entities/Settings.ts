import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity("settings")
export class Settings {
  @PrimaryColumn({ type: "varchar", length: 255 })
  key!: string;

  @Column({ type: "text", nullable: true })
  value?: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
