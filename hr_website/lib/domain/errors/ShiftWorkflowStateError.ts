export class ShiftWorkflowStateError extends Error {
  constructor(message = "The request is not in a state that allows this action.") {
    super(message);
    this.name = "ShiftWorkflowStateError";
  }
}
