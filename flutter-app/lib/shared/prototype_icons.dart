// SVG paths copied verbatim from the approved HTML prototype.
import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

const prototypeIcons = <String, String>{
  'home': '<path d="M3 10.4 12 3.2l9 7.2"/><path d="M5.6 9.2V19a2 2 0 0 0 2 2h8.8a2 2 0 0 0 2-2V9.2"/>',
  'layers': '<path d="M12 3 3 7.5l9 4.5 9-4.5z"/><path d="M3 12.6 12 17.1l9-4.5"/><path d="M3 17.1 12 21.6l9-4.5"/>',
  'search': '<circle cx="11" cy="11" r="7"/><path d="m16.5 16.5 4.2 4.2"/>',
  'user': '<circle cx="12" cy="8" r="3.8"/><path d="M4.5 21c.6-3.9 3.8-6.2 7.5-6.2s6.9 2.3 7.5 6.2"/>',
  'back': '<path d="M15 4.5 7.5 12 15 19.5"/>',
  'more': '<circle cx="5.5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="18.5" cy="12" r="1.4"/>',
  'chevr': '<path d="m9.5 5.5 6.5 6.5-6.5 6.5"/>',
  'chevd': '<path d="m5.5 9.5 6.5 6.5 6.5-6.5"/>',
  'chevu': '<path d="m5.5 14.5 6.5-6.5 6.5 6.5"/>',
  'heart': '<path d="M12 20.3s-7.4-4.6-7.4-9.9A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.4 2.8c0 5.3-7.4 9.9-7.4 9.9Z"/>',
  'bookmark': '<path d="M7 3.8h10a1 1 0 0 1 1 1v15.5L12 15.9l-6 4.4V4.8a1 1 0 0 1 1-1Z"/>',
  'share': '<path d="M12 15.5V3.6"/><path d="m8.2 7.2 3.8-3.6 3.8 3.6"/><path d="M5 13v6.4a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V13"/>',
  'list': '<path d="M9 6.5h11M9 12h11M9 17.5h11"/><circle cx="4.6" cy="6.5" r="1.1"/><circle cx="4.6" cy="12" r="1.1"/><circle cx="4.6" cy="17.5" r="1.1"/>',
  'clock': '<circle cx="12" cy="12" r="8.3"/><path d="M12 7.4V12l3.2 2"/>',
  'check':
      '<circle cx="12" cy="12" r="8.3"/><path d="m8.4 12.3 2.6 2.6 4.6-5.2"/>',
  'pen': '<path d="M13 4H7a1.6 1.6 0 0 0-1.6 1.6v13A1.6 1.6 0 0 0 7 20.2h10a1.6 1.6 0 0 0 1.6-1.6V9.6z"/><path d="M13 4v5.6h5.6"/>',
  'msg': '<path d="M20 11.6a7.3 7.3 0 0 1-7.3 7.3H8.2L4 21.5V11.6a7.3 7.3 0 0 1 7.3-7.3h1.4A7.3 7.3 0 0 1 20 11.6Z"/>',
  'eye': '<path d="M2.6 12S6.2 6.4 12 6.4 21.4 12 21.4 12 17.8 17.6 12 17.6 2.6 12 2.6 12Z"/><circle cx="12" cy="12" r="2.6"/>',
  'send': '<path d="m4 11.5 16-7-7 16-2.4-6.6z"/>',
  'tag': '<path d="M11.6 3.4H20v8.4l-8.8 8.8a1.4 1.4 0 0 1-2 0l-6.4-6.4a1.4 1.4 0 0 1 0-2z"/><circle cx="16.2" cy="7.8" r="1.4"/>',
  'bell': '<path d="M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6Z"/><path d="M10.5 19.5a2 2 0 0 0 3 0"/>',
  'star': '<path d="m12 3.6 2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.8l5.9-.8z"/>',
  'clockback': '<path d="M3.6 12a8.4 8.4 0 1 0 2.6-6.1"/><path d="M3.4 4.6v4.6h4.6"/><path d="M12 8v4.3l3 1.8"/>',
  'lock': '<rect x="4.6" y="10.4" width="14.8" height="10" rx="2"/><path d="M8.2 10.4V7.6a3.8 3.8 0 0 1 7.6 0v2.8"/>',
  'logout': '<path d="M14.5 4.5h3.9a1.6 1.6 0 0 1 1.6 1.6v11.8a1.6 1.6 0 0 1-1.6 1.6h-3.9"/><path d="M10 8.3 6 12l4 3.7"/><path d="M6 12h8.6"/>',
  'alert': '<circle cx="12" cy="12" r="8.3"/><path d="M12 7.6v5"/><circle cx="12" cy="16" r=".9"/>',
  'wifi-off': '<path d="M3 4l18 16"/><path d="M5.2 10.4a11 11 0 0 1 4-2.2"/><path d="M18.4 11a11 11 0 0 0-3.1-2.1"/><path d="M8.2 14.2a6 6 0 0 1 2.4-1.1"/><path d="M15 14.6a6 6 0 0 0-1.3-.9"/><circle cx="12" cy="18" r="1.1"/>',
  'empty': '<path d="M4 7.5h16v11a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5z"/><path d="M4 7.5 6.2 4h11.6L20 7.5"/><path d="M9.5 12h5"/>',
  'image': '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="8.6" cy="9.6" r="1.6"/><path d="m4 17 4.6-4.6 4 4 3-2.6 4.4 3.8"/>',
  'upload': '<path d="M12 16V4.5"/><path d="m8 8.5 4-4 4 4"/><path d="M4.5 15v3.9a1.6 1.6 0 0 0 1.6 1.6h11.8a1.6 1.6 0 0 0 1.6-1.6V15"/>',
  'sun': '<circle cx="12" cy="12" r="4"/><path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.4 5.4l1.6 1.6M17 17l1.6 1.6M18.6 5.4 17 7M7 17l-1.6 1.6"/>',
  'moon': '<path d="M20 13.4A8.4 8.4 0 0 1 10.6 4a8.4 8.4 0 1 0 9.4 9.4Z"/>',
  'cog': '<circle cx="12" cy="12" r="3.1"/><path d="M20.314 10.233A8.5 8.5 0 0 1 20.314 13.767L18.456 13.79A6.7 6.7 0 0 1 17.831 15.299L19.129 16.629A8.5 8.5 0 0 1 16.629 19.129L15.299 17.831A6.7 6.7 0 0 1 13.79 18.456L13.767 20.314A8.5 8.5 0 0 1 10.233 20.314L10.21 18.456A6.7 6.7 0 0 1 8.701 17.831L7.371 19.129A8.5 8.5 0 0 1 4.871 16.629L6.169 15.299A6.7 6.7 0 0 1 5.544 13.79L3.686 13.767A8.5 8.5 0 0 1 3.686 10.233L5.544 10.21A6.7 6.7 0 0 1 6.169 8.701L4.871 7.371A8.5 8.5 0 0 1 7.371 4.871L8.701 6.169A6.7 6.7 0 0 1 10.21 5.544L10.233 3.686A8.5 8.5 0 0 1 13.767 3.686L13.79 5.544A6.7 6.7 0 0 1 15.299 6.169L16.629 4.871A8.5 8.5 0 0 1 19.129 7.371L17.831 8.701A6.7 6.7 0 0 1 18.456 10.21L20.314 10.233Z"/>',
  'refresh':
      '<path d="M20.4 12a8.4 8.4 0 1 1-2.5-6"/><path d="M20.6 4.6v4.6h-4.6"/>',
  'plus': '<path d="M12 5.5v13M5.5 12h13"/>',
  'close': '<path d="m6 6 12 12M18 6 6 18"/>',
  'signal': '<path d="M4 20V10M9.3 20V5M14.7 20v-7M20 20V8"/>',
};

/// 直接绘制已确认原型的 SVG 图标，颜色和尺寸由所在组件传入。
class PrototypeIcon extends StatelessWidget {
  const PrototypeIcon(this.name, {super.key, this.size = 20, this.color});
  final String name;
  final double size;
  final Color? color;
  @override
  Widget build(BuildContext context) => SvgPicture.string(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#000000" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${prototypeIcons[name] ?? prototypeIcons['alert']}</svg>',
    width: size,
    height: size,
    colorFilter: ColorFilter.mode(
      color ??
          IconTheme.of(context).color ??
          Theme.of(context).colorScheme.onSurface,
      BlendMode.srcIn,
    ),
  );
}

/// 兼容常用 Material 图标名称并映射为原型图标，保持已有调用语义。
class ReaderIcon extends StatelessWidget {
  const ReaderIcon(this.icon, {super.key, this.size, this.color});
  final IconData? icon;
  final double? size;
  final Color? color;
  @override
  Widget build(BuildContext context) => PrototypeIcon(
    _names[icon] ?? 'pen',
    size: size ?? IconTheme.of(context).size ?? 20,
    color: color,
  );
  static final _names = <IconData, String>{
    Icons.home_outlined: 'home',
    Icons.arrow_back: 'back',
    Icons.photo_outlined: 'image',
    Icons.add_photo_alternate_outlined: 'image',
    Icons.home: 'home',
    Icons.grid_view_outlined: 'layers',
    Icons.search: 'search',
    Icons.person_outline: 'user',
    Icons.person: 'user',
    Icons.notifications_none: 'bell',
    Icons.chevron_right: 'chevr',
    Icons.chevron_left: 'back',
    Icons.bookmark_outline: 'bookmark',
    Icons.bookmark: 'bookmark',
    Icons.thumb_up: 'heart',
    Icons.thumb_up_outlined: 'heart',
    Icons.history: 'clockback',
    Icons.edit_note: 'pen',
    Icons.lock_outline: 'lock',
    Icons.contrast: 'cog',
    Icons.logout: 'logout',
    Icons.add: 'plus',
    Icons.brightness_auto_outlined: 'cog',
    Icons.light_mode_outlined: 'sun',
    Icons.dark_mode_outlined: 'moon',
    Icons.check: 'check',
    Icons.schedule: 'clock',
    Icons.check_circle_outline: 'check',
    Icons.inbox_outlined: 'empty',
    Icons.cloud_off_outlined: 'wifi-off',
    Icons.broken_image_outlined: 'image',
    Icons.folder_outlined: 'layers',
    Icons.folder_open_outlined: 'layers',
    Icons.arrow_forward: 'chevr',
    Icons.visibility_outlined: 'eye',
    Icons.visibility_off_outlined: 'eye',
    Icons.auto_stories_outlined: 'layers',
    Icons.format_list_bulleted: 'list',
    Icons.ios_share: 'share',
    Icons.close: 'close',
    Icons.send: 'send',
    Icons.delete_outline: 'close',
    Icons.image_outlined: 'image',
    Icons.photo_camera_outlined: 'image',
    Icons.refresh: 'refresh',
    Icons.more_vert: 'more',
    Icons.upload: 'upload',
  };
}
