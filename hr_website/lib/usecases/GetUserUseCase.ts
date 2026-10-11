import type { User } from "@/lib/domain/entities/User";
import type { IUserRepository } from "@/lib/domain/repositories/IUserRepository";

export class GetUserUseCase {
  constructor(private readonly userRepository: IUserRepository) {}

  async execute(id: string): Promise<User | null> {
    return this.userRepository.getById(id);
  }
}
