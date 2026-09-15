import type { Request, Response, NextFunction } from 'express';
import { HttpConst } from '../config/httpConstants';

export function localAccess(request: Request, response: Response, next: NextFunction): void {
  const host = request.headers.host || '';
  const origin = request.headers.origin;
  if (!HttpConst.HostPattern.test(host) || (origin && origin !== `http://${host}`) || request.get(HttpConst.FetchSite) === HttpConst.CrossSite) {
    response.status(403).json({ message: '仅允许本机 LogViewer 页面访问此接口' });
    return;
  }
  next();
}
