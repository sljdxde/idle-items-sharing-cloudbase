#!/usr/bin/env bash
# ================================================
# scripts/video/make-video.sh — 合成「邻里好物」产品介绍视频
# 结构：片头 → 产品背景 → 功能简介 → 操作说明(8 张实机截图+字幕) → 片尾
# 竖屏 1080x2340，约 50s，输出 docs/邻里好物-产品介绍.mp4
# 素材：frames/ 由 shots.mjs 截实机画面；cards/ 由 cards.mjs 渲染文字卡片
# 依赖：ffmpeg（仅用 loop/fade/overlay/concat，不需要 drawtext）
# ================================================
set -euo pipefail
cd "$(dirname "$0")"

W=1080; H=2340; FPS=30
OUT="../../docs/邻里好物-产品介绍.mp4"
mkdir -p ../../docs segs

ENC=(-c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p -r $FPS)

# ── 文字卡片段 ──
card() { # $1=卡片名 $2=时长
  local name=$1 dur=$2
  ffmpeg -y -loglevel error -loop 1 -i "cards/$name.png" -t "$dur" \
    -vf "fade=t=in:st=0:d=0.4,fade=t=out:st=$(echo "$dur-0.4" | bc):d=0.4" \
    "${ENC[@]}" "segs/$name.mp4"
}

# ── 实机截图片段 + 底部字幕条 ──
shot() { # $1=帧名 $2=字幕条名 $3=时长
  local f=$1 cap=$2 dur=$3
  ffmpeg -y -loglevel error -loop 1 -i "frames/$f.png" -loop 1 -i "cards/$cap.png" -t "$dur" \
    -filter_complex "[0:v]scale=$W:$H,fade=t=in:st=0:d=0.35,fade=t=out:st=$(echo "$dur-0.35" | bc):d=0.35[bg];[bg][1:v]overlay=0:2120" \
    "${ENC[@]}" "segs/$f.mp4"
}

card title 3.5
card bg    7.5
card feat  8.5
card ops   2.5

shot 01-home-anon      cap01 4
shot 04-home-list      cap02 4
shot 02-login-error    cap03 4
shot 03-home-loggedin  cap04 4
shot 05-publish-photo  cap05 4
shot 06-detail-address cap06 4
shot 07-borrows        cap07 4
shot 08-mine           cap08 4

card end 4.5

# ── 拼接 ──
{
  echo "file 'segs/title.mp4'"
  echo "file 'segs/bg.mp4'"
  echo "file 'segs/feat.mp4'"
  echo "file 'segs/ops.mp4'"
  echo "file 'segs/01-home-anon.mp4'"
  echo "file 'segs/04-home-list.mp4'"
  echo "file 'segs/02-login-error.mp4'"
  echo "file 'segs/03-home-loggedin.mp4'"
  echo "file 'segs/05-publish-photo.mp4'"
  echo "file 'segs/06-detail-address.mp4'"
  echo "file 'segs/07-borrows.mp4'"
  echo "file 'segs/08-mine.mp4'"
  echo "file 'segs/end.mp4'"
} > concat.txt

ffmpeg -y -loglevel error -f concat -safe 0 -i concat.txt -c copy "$OUT"
echo "OK → $OUT"
ffprobe -v error -show_entries format=duration,size -of default=nw=1 "$OUT"
