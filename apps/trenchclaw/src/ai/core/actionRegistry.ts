import type {
  Action,
  ActionCategory,
  ActionRegistryContract,
  RegisteredAction,
} from "../contracts/types";

export class ActionRegistry implements ActionRegistryContract {
  private readonly actions = new Map<string, Action>();

  register<TInput, TOutput>(action: Action<TInput, TOutput>): void {
    if (this.actions.has(action.name)) {
      throw new Error(`Action "${action.name}" is already registered`);
    }
    this.actions.set(action.name, action as Action);
  }

  get(name: string): Action | undefined {
    return this.actions.get(name);
  }

  list(): RegisteredAction[] {
    return Array.from(this.actions.values()).map((action) => ({
      name: action.name,
      category: action.category,
      subcategory: action.subcategory,
    }));
  }

  byCategory(category: ActionCategory): RegisteredAction[] {
    return this.list().filter((action) => action.category === category);
  }
}
