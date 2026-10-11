/**
 * The category a facility names is not in the caller's catalogue (SCRUM-65). Raised by
 * `facilities_category_fkey`, which the repository translates into this type so the route can answer
 * `400` instead of a bare `500`: the caller either has a stale screen or the project is missing
 * `SCRUM-65_facility_categories.sql`, and both are fixable by the person reading the message.
 */
export class FacilityCategoryNotFoundError extends Error {
  constructor() {
    super(
      "The selected facility category does not exist. Please reload the page and choose one of the listed groups.",
    );
    this.name = "FacilityCategoryNotFoundError";
  }
}
