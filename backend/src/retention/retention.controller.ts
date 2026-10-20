import { Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { AppRole } from '../auth/roles';
import { RetentionService, type RetentionPreview } from './retention.service';

/**
 * Lets a CCAE administrator see what the retention job would delete, without
 * deleting. Its own controller rather than a route on AdminController, so the
 * two can change without touching the same file.
 */
@Controller('admin/retention')
@Roles(AppRole.CcaeAdmin)
export class RetentionController {
  constructor(private readonly retention: RetentionService) {}

  /**
   * A preview. It only counts: no delete, no lock and no audit row, so it is
   * safe to call as often as someone likes. POST rather than GET only because
   * it runs queries, but nothing is created, hence 200 rather than 201.
   */
  @Post('dry-run')
  @HttpCode(HttpStatus.OK)
  dryRun(): Promise<RetentionPreview> {
    return this.retention.preview();
  }
}
