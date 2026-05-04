import { Entity, PrimaryColumn, Column, ManyToOne, JoinColumn } from "typeorm";

import { User } from "./User";

@Entity("sessions")
export class Session {
  @PrimaryColumn({ type: "varchar" })
  id!: string;

  @Column({ type: "varchar" })
  userId!: string;

  @Column({ type: "varchar", length: 500, unique: true })
  token!: string;

  @Column({ type: "bigint" })
  expiresAt!: number;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user?: User;
}
