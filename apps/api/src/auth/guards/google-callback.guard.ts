import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * The Google callback guard, except that "signed in with Google but not admitted"
 * is not an error: the request continues with no user so the controller can redirect
 * to the login page with an explanation instead of returning a bare 401.
 */
@Injectable()
export class GoogleCallbackGuard extends AuthGuard('google') {
  handleRequest<TUser>(err: unknown, user: TUser | false): TUser | null {
    if (err) throw err;
    return user || null;
  }
}
