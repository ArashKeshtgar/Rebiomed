import { Request, Response, NextFunction } from 'express';
import User from '../models/User';

// Use after `auth`. Checks the database rather than the isAdmin claim in the
// JWT, so revoking admin rights takes effect before the token expires.
export default async function admin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await User.findById(req.user!.id).select('isAdmin');
    if (!user?.isAdmin) {
      res.status(403).json({ msg: 'Admin access required' });
      return;
    }
    next();
  } catch (err) {
    console.error((err as Error).message);
    res.status(500).send('Server error');
  }
}

export const isAdminUser = async (userId: string): Promise<boolean> =>
  !!(await User.findById(userId).select('isAdmin'))?.isAdmin;
