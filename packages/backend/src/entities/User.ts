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

  @Column({ type: "text", nullable: true })
  tvtimeAccessToken?: string;

  @Column({ type: "text", nullable: true })
  tvtimeRefreshToken?: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  tvtimeEmail?: string;

  @Column({ type: "text", nullable: true })
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

  @Column({ type: "varchar", length: 255, nullable: true })
  simklUsername?: string;

  @Column({ type: "varchar", length: 500, nullable: true })
  simklAccessToken?: string;

  @Column({ type: "varchar", length: 500, nullable: true })
  simklClientId?: string;

  @Column({ type: "varchar", length: 500, nullable: true })
  simklThumb?: string;

  @Column({ type: "text", nullable: true })
  bingersCookieJar?: string;

  @Column({ type: "bigint", nullable: true })
  bingersSessionExpiresAt?: number;

  @Column({ type: "varchar", length: 255, nullable: true })
  bingersEmail?: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  bingersUserId?: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  bingersUsername?: string;

  @Column({ type: "varchar", length: 500, nullable: true })
  bingersThumb?: string;

  @Column({ type: "boolean", default: false })
  bingersMarkMoviesAsRewatched!: boolean;

  @Column({ type: "boolean", default: false })
  bingersMarkEpisodesAsRewatched!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
