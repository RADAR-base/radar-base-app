import { Assessment, AssessmentType, LoggerService, LocalizationService, QuestionnaireService, StorageService, Task, TaskState } from '../types';
import { DefaultAppServerService } from './AppServerService';

function setDateTimeToMidnight(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}
function setDateTimeToMidnightEpoch(date: Date): number {
  return setDateTimeToMidnight(date).getTime();
}
function getMilliseconds({ days = 0, hours = 0, minutes = 0 }: { days?: number; hours?: number; minutes?: number }) {
  return ((days * 24 + hours) * 60 + minutes) * 60 * 1000;
}

export class AppserverScheduleService {
  constructor(
    private readonly store: StorageService,
    private readonly logger: LoggerService,
    private readonly appServer: DefaultAppServerService,
    private readonly localization: LocalizationService,
    private readonly questionnaire: QuestionnaireService
  ) {}

  init() {}

  async getTasksForDate(date: Date, type: AssessmentType): Promise<Task[]> {
    const startTime = setDateTimeToMidnight(date);
    const endTime = new Date(startTime.getTime() + getMilliseconds({ days: 1 }));
    try {
      const tasks = await this.appServer.getScheduleForDates(startTime, endTime);
      if (!tasks || !tasks.length) throw new Error('empty');
      const mapped = await Promise.all(tasks.map((t: Task) => this.mapTaskDTO(t, 'SCHEDULED')));
      return this.setTasks('SCHEDULED', mapped);
    } catch (e) {
      this.logger.log('Error pulling tasks.. ' + (e as any));
      return this.getLocalTasksForDate(date, 'SCHEDULED');
    }
  }

  async getLocalTasksForDate(date: Date, type: AssessmentType): Promise<Task[]> {
    const schedule = await this.getTasks(type);
    const startTime = setDateTimeToMidnightEpoch(date);
    const endTime = startTime + getMilliseconds({ days: 1 });
    return schedule ? schedule.filter(d => (d.timestamp || 0) + (d.completionWindow || 0) > startTime && (d.timestamp || 0) < endTime) : [];
  }

  async generateSchedule(referenceTimestamp?: number, utcOffsetPrev?: number): Promise<Task[]> {
    this.logger.log('Updating schedule..', referenceTimestamp as any);
    await Promise.all([this.appServer.init(), this.getCompletedTasks()]);
    const tasks = await this.appServer.getSchedule();
    const mapped = await Promise.all(tasks.map((t: Task) => this.mapTaskDTO(t, 'SCHEDULED')));
    return this.setTasks('SCHEDULED', mapped);
  }

  async updateTaskToComplete(updatedTask: Task): Promise<any> {
    try {
      await this.appServer.updateTaskState(updatedTask.id, 'COMPLETED');
      return this.updateTaskToReportedCompletion(updatedTask);
    } catch {
      return this.updateTaskToCompleteLocal(updatedTask);
    }
  }

  // Storage helpers (minimal)
  private storageKey(type: AssessmentType) { return `sched:${type}`; }
  private async setTasks(type: AssessmentType, tasks: Task[]): Promise<Task[]> {
    await this.store.set(this.storageKey(type), tasks);
    return tasks;
  }
  private async getTasks(type: AssessmentType): Promise<Task[] | null> {
    return this.store.get<Task[] | null>(this.storageKey(type));
  }
  private async getCompletedTasks(): Promise<Task[] | null> {
    return this.store.get<Task[] | null>('sched:completed');
  }
  private async updateTaskToReportedCompletion(task: Task) {
    const completed = (await this.getCompletedTasks()) || [];
    completed.push({ ...task, completed: true });
    await this.store.set('sched:completed', completed);
    return completed;
  }
  private async updateTaskToCompleteLocal(task: Task) {
    const tasks = (await this.getTasks('SCHEDULED')) || [];
    const updated = tasks.map(t => t.id === task.id ? { ...t, completed: true } : t);
    await this.setTasks('SCHEDULED', updated);
    return updated;
  }

  async generateSingleAssessmentTask(assessment: Assessment, assessmentType: AssessmentType, referenceDate: number) {
    return;
  }

  private async mapTaskDTO(task: Task, assessmentType: AssessmentType): Promise<Task> {
    const assessment = await this.questionnaire.getAssessmentForTask(assessmentType, task);
    const newTask: Task = Object.assign(task, {
      completed: !!task.completed,
      nQuestions: assessment ? assessment.questions.length : 1,
      warning: assessment ? '' : '',
      requiresInClinicCompletion: assessment ? assessment.requiresInClinicCompletion : false,
      notifications: [],
    } as any);
    return newTask;
  }
}


