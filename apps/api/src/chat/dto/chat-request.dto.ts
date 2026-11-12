import { IsIn, IsNotEmpty, IsString, IsOptional, MaxLength } from 'class-validator';
import { PROVIDER_NAMES, type ProviderName } from '@slm/shared-types';

export class ChatRequestDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  message!: string;

  @IsOptional()
  @IsIn(PROVIDER_NAMES)
  provider?: ProviderName;
}
