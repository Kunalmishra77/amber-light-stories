-- Allow the render worker to store the final MP4 in the private `assets` bucket.
--
-- The bucket was created for images only (allowed_mime_types = image/*) with a
-- 20 MB cap. The render worker uploads the final video and its thumbnail, so the
-- allowlist must include video/mp4 and the cap must fit a short-form video.
--
-- 500 MB is generous for 9:16 short-form (typically a few MB to tens of MB) and
-- still bounds abuse. The bucket stays PRIVATE — objects are only ever served
-- via short-lived signed URLs and downloaded server-side for the YouTube upload.

update storage.buckets
set allowed_mime_types = array[
      'image/png', 'image/jpeg', 'image/webp', 'image/jpg',
      'video/mp4', 'audio/mp4', 'audio/mpeg'
    ],
    file_size_limit = 524288000  -- 500 MB
where id = 'assets';
