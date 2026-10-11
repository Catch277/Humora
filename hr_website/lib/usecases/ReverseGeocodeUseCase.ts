import type { IReverseGeocodingService } from "@/lib/domain/repositories/IReverseGeocodingService";

/**
 * The address of one coordinate, for the address field of the branch form. A deliberately thin use
 * case, like `ListBranchesUseCase`: it is the boundary that keeps the route handler from calling
 * infrastructure directly, and the place a cache would go if the lookup volume ever grew (Nominatim
 * asks for at most one request per second).
 */
export class ReverseGeocodeUseCase {
  constructor(private readonly geocodingService: IReverseGeocodingService) {}

  async execute(latitude: number, longitude: number): Promise<string | null> {
    return this.geocodingService.reverse(latitude, longitude);
  }
}
