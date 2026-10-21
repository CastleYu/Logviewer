import { Transform } from 'node:stream';
import { ApiErrorCode } from '../config/constants';
import { ServiceError } from './serviceError';

/** 丢弃截断起点之前的残行，保证尾部模式的第一行是完整日志行。 */
export function skipFirstLine(): Transform {
  let found = false;
  return new Transform({
    transform(chunk: Buffer, _encoding, done) {
      if (found) { done(null, chunk); return; }
      const index = chunk.indexOf(0x0a);
      if (index < 0) { done(); return; }
      found = true;
      done(null, chunk.subarray(index + 1));
    },
  });
}

/** 解压时限制输出体积，防止压缩炸弹或超大归档撑满磁盘与浏览器内存。 */
export function capBytes(limit: number): Transform {
  let total = 0;
  return new Transform({
    transform(chunk: Buffer, _encoding, done) {
      total += chunk.length;
      if (total > limit) { done(new ServiceError(ApiErrorCode.FileTooLarge, `解压后超过 ${Math.round(limit / 1048576)} MB 上限`, 413)); return; }
      done(null, chunk);
    },
  });
}

export function tooLarge(size: number, limit: number): ServiceError {
  const mb = (value: number) => `${(value / 1048576).toFixed(1)} MB`;
  return new ServiceError(ApiErrorCode.FileTooLarge, `文件 ${mb(size)} 超过单次打开上限 ${mb(limit)}，请改用“只看末尾”`, 413);
}

export { ServiceError };
