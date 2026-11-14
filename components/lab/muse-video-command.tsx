import {MUSE_VIDEO_COMMAND} from '@/desktop/src/muse-video-prompt.mjs';

export function MuseVideoCommand() {
  return <div role="note" aria-label="Câu lệnh tạo video cố định">
    <small>Câu lệnh cố định · chỉ đọc</small>
    <p>{MUSE_VIDEO_COMMAND}</p>
  </div>;
}
