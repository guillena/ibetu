import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { FriendsModule } from '../friends/friends.module.js';
import { OBJECT_STORAGE, R2StorageService } from '../storage/storage.service.js';
import { ChallengesController } from './challenges.controller.js';
import { ChallengesService } from './challenges.service.js';
import { ClockWorker } from './clock.worker.js';
import { ChallengeClocksService } from './clocks.service.js';
import { EvidenceController } from './evidence.controller.js';
import { EvidenceService } from './evidence.service.js';
import { HistoryController } from './history.controller.js';
import { HistoryService } from './history.service.js';
import { JudgeController } from './judge.controller.js';
import { JudgeService } from './judge.service.js';
import { OpenChallengesService } from './open-challenges.service.js';
import { ResultsController } from './results.controller.js';
import { ChallengeResultsService } from './results.service.js';

@Module({
  imports: [AuthModule, FriendsModule],
  controllers: [HistoryController, ChallengesController, EvidenceController, ResultsController, JudgeController],
  providers: [
    ChallengesService,
    ChallengeResultsService,
    ChallengeClocksService,
    ClockWorker,
    EvidenceService,
    HistoryService,
    OpenChallengesService,
    JudgeService,
    JwtAuthGuard,
    { provide: OBJECT_STORAGE, useClass: R2StorageService },
  ],
  exports: [ChallengesService, ChallengeResultsService, ChallengeClocksService, EvidenceService, JudgeService],
})
export class ChallengesModule {}
