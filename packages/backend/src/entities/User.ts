import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity("users")
export class User {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 255, nullable: true, unique: true })
  plexUsername?: string;

  @Column({ type: "varchar", length: 255, nullable: true, unique: true })
  jellyfinUsername?: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  displayName?: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  email?: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  tvtimeUsername?: string;

  @Column({ type: "varchar", length: 500, nullable: true })
  tvtimeAccessToken?: string;

  @Column({ type: "varchar", length: 500, nullable: true })
  tvtimeRefreshToken?: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  tvtimeEmail?: string;

  @Column({ type: "text", nullable: true })
  tvtimePassword?: string;

  @Column({ type: "varchar", length: 500, nullable: true })
  tvtimeThumb?: string;

  @Column({ type: "varchar", length: 500, nullable: true })
  plexAccessToken?: string;

  @Column({ type: "varchar", length: 500, nullable: true })
  plexThumb?: string;

  @Column({ type: "varchar", length: 500, nullable: true })
  jellyfinAccessToken?: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  jellyfinUserId?: string;

  @Column({ type: "varchar", length: 500, nullable: true })
  jellyfinThumb?: string;

  @Column({ type: "boolean", default: false })
  isAdmin!: boolean;

  @Column({ type: "boolean", default: true })
  enabled!: boolean;

  @Column({ type: "boolean", default: false })
  tvtimeMarkMoviesAsRewatched!: boolean;

  @Column({ type: "boolean", default: false })
  tvtimeMarkEpisodesAsRewatched!: boolean;

  @Column({ type: "varchar", length: 255, nullable: true })
  traktUsername?: string;

  @Column({ type: "varchar", length: 500, nullable: true })
  traktAccessToken?: string;

  @Column({ type: "varchar", length: 500, nullable: true })
  traktRefreshToken?: string;

  @Column({ type: "bigint", nullable: true })
  traktTokenExpiresAt?: number;

  @Column({ type: "varchar", length: 500, nullable: true })
  traktClientId?: string;

  @Column({ type: "varchar", length: 500, nullable: true })
  traktClientSecret?: string;

  @Column({ type: "varchar", length: 500, nullable: true })
  traktThumb?: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
