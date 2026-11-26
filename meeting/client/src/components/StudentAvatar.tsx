/**
 * StudentAvatar — avatar 3 lớp thống nhất với CodeClass:
 * nền màu (hash theo tên) → chữ cái đầu → ảnh con vật (ẩn nếu lỗi tải).
 */
import React, { useState } from 'react';
import { animalAvatarUrl, avatarBgColor } from '../lib/avatar';

export const StudentAvatar: React.FC<{ name: string; sizeClass?: string; ringClass?: string }> = ({
  name,
  sizeClass = 'h-9 w-9 text-sm',
  ringClass = 'ring-2 ring-white/10',
}) => {
  const [imgOk, setImgOk] = useState(true);
  return (
    <div
      className={`${sizeClass} relative rounded-full flex items-center justify-center font-bold text-white/95 ${ringClass} overflow-hidden`}
      style={{ backgroundColor: avatarBgColor(name) }}
    >
      <span className="absolute inset-0 z-0 flex items-center justify-center">
        {(name || '?').charAt(0).toUpperCase()}
      </span>
      {imgOk && (
        <img
          src={animalAvatarUrl(name)}
          alt=""
          className="absolute inset-0 z-10 h-full w-full object-cover"
          onError={() => setImgOk(false)}
        />
      )}
    </div>
  );
};

export default StudentAvatar;
