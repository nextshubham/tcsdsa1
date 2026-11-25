type JsonObject = Record<string, unknown>;

export class FieldConcatActivityIdResolver {
  private static isObject(value: unknown): value is JsonObject {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  private static toId(value: unknown): number | undefined {
    if (
      (typeof value !== 'string' && typeof value !== 'number') ||
      !/^\d+$/.test(String(value).trim())
    ) {
      return undefined;
    }
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
  }

  private static findDirectId(source: JsonObject): number | undefined {
    const activity = source.activity;
    return (
      FieldConcatActivityIdResolver.toId(source.activityId) ??
      FieldConcatActivityIdResolver.toId(activity) ??
      (FieldConcatActivityIdResolver.isObject(activity)
        ? FieldConcatActivityIdResolver.toId(
            activity.activityId ?? activity.id
          )
        : undefined)
    );
  }

  public static resolve(
    projectDetails: unknown,
    taskDetails: unknown
  ): number {
    const project = FieldConcatActivityIdResolver.isObject(projectDetails)
      ? projectDetails
      : {};
    const task = FieldConcatActivityIdResolver.isObject(taskDetails)
      ? taskDetails
      : {};

    const taskActivityId = FieldConcatActivityIdResolver.findDirectId(task);
    const projectActivityId = FieldConcatActivityIdResolver.findDirectId(project);

    if (
      taskActivityId !== undefined &&
      projectActivityId !== undefined &&
      taskActivityId !== projectActivityId
    ) {
      throw new Error('Task and Project reference different activity IDs');
    }
    if (taskActivityId !== undefined) return taskActivityId;
    if (projectActivityId !== undefined) return projectActivityId;

    // Never select an arbitrary activity when the project contains several.
    const embedded = FieldConcatActivityIdResolver.isObject(project._embedded)
      ? project._embedded
      : {};
    let activities: unknown[] = [];
    if (Array.isArray(project.activities)) {
      activities = project.activities;
    } else if (Array.isArray(embedded.activities)) {
      activities = embedded.activities;
    }

    if (activities.length === 1) {
      const item = activities[0];
      const id = FieldConcatActivityIdResolver.isObject(item)
        ? FieldConcatActivityIdResolver.toId(item.activityId ?? item.id)
        : FieldConcatActivityIdResolver.toId(item);
      if (id !== undefined) return id;
    }

    throw new Error(
      'FCU Activity ID not found or ambiguous in PM Project/Task response; verify the actual Aprimo response shape'
    );
  }
}
