export class VeilError extends Error {
  errors: any[];
  url?: string;

  constructor(errors: any[], url?: string) {
    super("Veil Error");
    this.errors = errors;
    if (url) this.url = url;
  }
}
