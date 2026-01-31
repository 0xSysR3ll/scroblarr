import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  JoinColumn,
} from "typeorm";
import { User } from "./User";

@Entity("sync_history")
export class SyncHistory {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: "userId" })
  user!: User;

  @Column({ type: "varchar", length: 255 })
  userId!: string;

  @Column({ type: "varchar", length: 50 })
  mediaType!: string;

  @Column({ type: "varchar", length: 500 })
  mediaTitle!: string;

  @Column({ type: "varchar", length: 50, nullable: true })
  source?: string;

  @Column({ type: "varchar", length: 100, nullable: true })
  tvdbEpisodeId?: string;

  @Column({ type: "varchar", length: 100, nullable: true })
  tvdbMovieId?: string;

  @Column({ type: "varchar", length: 100, nullable: true })
  imdbMovieId?: string;

  @Column({ type: "varchar", length: 100, nullable: true })
  imdbEpisodeId?: string;

  @Column({ type: "varchar", length: 100, nullable: true })
  tmdbMovieId?: string;

  @Column({ type: "varchar", length: 100, nullable: true })
  tmdbSeriesId?: string;

  @Column({ type: "text", nullable: true })
  posterUrl?: string;

  @Column({ type: "integer", nullable: true })
  seasonNumber?: number;

  @Column({ type: "integer", nullable: true })
  episodeNumber?: number;

  @Column({ type: "integer", nullable: true })
  year?: number;

  @Column({ type: "boolean", default: true })
  success!: boolean;

  @Column({ type: "text", nullable: true })
  errorMessage?: string;

  @Column({ type: "boolean", default: false })
  wasRewatched!: boolean;

  @Column({ type: "text", nullable: true })
  destinations?: string;

  @CreateDateColumn()
  syncedAt!: Date;
}
