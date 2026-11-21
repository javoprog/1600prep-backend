import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  BulkSyncResultsDto,
  SaveAttemptDto,
  SaveSessionDto,
} from './dto/results.dto';

@Injectable()
export class ResultsService {
  constructor(private readonly prisma: PrismaService) {}

  async saveAttempt(userId: string, dto: SaveAttemptDto) {
    const attemptedAt = new Date(dto.timestamp || Date.now());
    const timeSpentMs = Math.max(0, Math.round(dto.timeSpent || 0));

    const record = await this.prisma.questionAttempt.upsert({
      where: {
        userId_clientAttemptId: {
          userId,
          clientAttemptId: dto.id,
        },
      },
      create: {
        clientAttemptId: dto.id,
        userId,
        clientSessionId: dto.sessionId || null,
        questionId: dto.questionId,
        subject: dto.subject,
        domain: dto.domain,
        skill: dto.skill,
        difficulty: dto.difficulty || null,
        selectedAnswer: dto.selectedAnswer,
        correctAnswerJson: JSON.stringify(dto.correctAnswer || []),
        isCorrect: dto.isCorrect,
        timeSpentMs,
        attemptedAt,
      },
      update: {
        selectedAnswer: dto.selectedAnswer,
        isCorrect: dto.isCorrect,
        timeSpentMs,
      },
    });

    return record;
  }

  async saveSession(userId: string, dto: SaveSessionDto) {
    const startedAt = new Date(dto.startedAt || Date.now());
    const completedAt = dto.completedAt ? new Date(dto.completedAt) : null;
    const totalTimeMs = Math.max(0, Math.round(dto.totalTime || 0));

    const record = await this.prisma.practiceSessionRecord.upsert({
      where: {
        userId_clientSessionId: {
          userId,
          clientSessionId: dto.id,
        },
      },
      create: {
        clientSessionId: dto.id,
        userId,
        subject: dto.subject,
        mode: dto.mode,
        title: dto.title,
        totalQuestions: dto.totalQuestions,
        answeredCount: dto.answeredCount,
        correctCount: dto.correctCount,
        totalTimeMs,
        startedAt,
        completedAt,
      },
      update: {
        title: dto.title,
        totalQuestions: dto.totalQuestions,
        answeredCount: dto.answeredCount,
        correctCount: dto.correctCount,
        totalTimeMs,
        completedAt,
      },
    });

    return record;
  }

  async syncResults(userId: string, dto: BulkSyncResultsDto) {
    const attempts = dto.attempts || [];
    const sessions = dto.sessions || [];

    for (const session of sessions) {
      await this.saveSession(userId, session);
    }

    for (const attempt of attempts) {
      await this.saveAttempt(userId, attempt);
    }

    return this.getSummary(userId);
  }

  async getSummary(userId: string) {
    const [attempts, sessions] = await Promise.all([
      this.prisma.questionAttempt.findMany({
        where: { userId },
        orderBy: { attemptedAt: 'desc' },
      }),
      this.prisma.practiceSessionRecord.findMany({
        where: { userId },
        orderBy: { startedAt: 'desc' },
        take: 30,
      }),
    ]);

    const totalAttempts = attempts.length;
    let correctAttempts = 0;
    let totalTimeMs = 0;

    const bySubject = {
      rw: { total: 0, correct: 0, accuracyPercent: 0 },
      math: { total: 0, correct: 0, accuracyPercent: 0 },
    };

    // Track latest attempt outcome per questionId
    const latestByQuestion = new Map<string, boolean>();
    const solvedSet = new Set<string>();

    for (const att of attempts) {
      if (att.isCorrect) {
        correctAttempts++;
        solvedSet.add(att.questionId);
      }
      totalTimeMs += att.timeSpentMs;

      if (!latestByQuestion.has(att.questionId)) {
        latestByQuestion.set(att.questionId, att.isCorrect);
      }

      const subj = att.subject === 'rw' ? 'rw' : 'math';
      bySubject[subj].total++;
      if (att.isCorrect) {
        bySubject[subj].correct++;
      }
    }

    bySubject.rw.accuracyPercent =
      bySubject.rw.total > 0
        ? Math.round((bySubject.rw.correct / bySubject.rw.total) * 100)
        : 0;
    bySubject.math.accuracyPercent =
      bySubject.math.total > 0
        ? Math.round((bySubject.math.correct / bySubject.math.total) * 100)
        : 0;

    const accuracyPercent =
      totalAttempts > 0
        ? Math.round((correctAttempts / totalAttempts) * 100)
        : 0;

    const mistakeQuestionIds: string[] = [];
    latestByQuestion.forEach((isCorrect, qId) => {
      if (!isCorrect) {
        mistakeQuestionIds.push(qId);
      }
    });

    return {
      totalAttempts,
      correctAttempts,
      accuracyPercent,
      uniqueQuestionsAttempted: latestByQuestion.size,
      uniqueQuestionsSolved: solvedSet.size,
      totalTimeMs,
      bySubject,
      solvedQuestionIds: Array.from(solvedSet),
      mistakeQuestionIds,
      recentSessions: sessions.map((s) => ({
        id: s.clientSessionId,
        subject: s.subject,
        mode: s.mode,
        title: s.title,
        totalQuestions: s.totalQuestions,
        answeredCount: s.answeredCount,
        correctCount: s.correctCount,
        totalTime: s.totalTimeMs,
        startedAt: s.startedAt.getTime(),
        completedAt: s.completedAt ? s.completedAt.getTime() : null,
      })),
      recentAttempts: attempts.slice(0, 50).map((a) => {
        let correctAnswer: string[] = [];
        try {
          correctAnswer = JSON.parse(a.correctAnswerJson);
        } catch {
          correctAnswer = [];
        }
        return {
          id: a.clientAttemptId,
          questionId: a.questionId,
          sessionId: a.clientSessionId,
          subject: a.subject,
          domain: a.domain,
          skill: a.skill,
          difficulty: a.difficulty,
          selectedAnswer: a.selectedAnswer,
          correctAnswer,
          isCorrect: a.isCorrect,
          timeSpent: a.timeSpentMs,
          timestamp: a.attemptedAt.getTime(),
        };
      }),
    };
  }

  async clearResults(userId: string) {
    await this.prisma.$transaction([
      this.prisma.questionAttempt.deleteMany({ where: { userId } }),
      this.prisma.practiceSessionRecord.deleteMany({ where: { userId } }),
    ]);
    return { cleared: true };
  }
}
