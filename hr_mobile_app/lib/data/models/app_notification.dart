import '../../core/format.dart';

class AppNotification {
  const AppNotification({
    required this.id,
    required this.title,
    required this.body,
    required this.type,
    required this.isRead,
    required this.createdAt,
    required this.entityType,
    required this.entityId,
  });

  final String id;
  final String title;
  final String body;
  final String type;
  final bool isRead;
  final DateTime createdAt;
  final String? entityType;
  final String? entityId;

  AppNotification copyWith({bool? isRead}) => AppNotification(
        id: id,
        title: title,
        body: body,
        type: type,
        isRead: isRead ?? this.isRead,
        createdAt: createdAt,
        entityType: entityType,
        entityId: entityId,
      );

  static const String columns =
      'id, title, body, type, is_read, created_at, related_entity_type, related_entity_id';

  factory AppNotification.fromJson(Map<String, dynamic> j) => AppNotification(
        id: j['id'].toString(),
        title: (j['title'] ?? '').toString(),
        body: (j['body'] ?? '').toString(),
        type: (j['type'] ?? 'general').toString(),
        isRead: j['is_read'] == true,
        createdAt: parseDate(j['created_at']) ?? DateTime.now(),
        entityType: j['related_entity_type']?.toString(),
        entityId: j['related_entity_id']?.toString(),
      );
}
