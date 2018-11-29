export class VeilError extends Error {
  errors: any[];

  constructor(errors: any[]) {
    super("Veil Error");
    this.errors = errors;
  }
}
