import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/auth_provider.dart';
import '../providers/data_provider.dart';

class ProfileSwitcherWidget extends StatelessWidget {
  const ProfileSwitcherWidget({super.key});

  String _getRoleName(String roleSlug) {
    switch (roleSlug) {
      case 'admin':
        return 'مدير النظام';
      case 'supervisor':
        return 'مشرف';
      case 'sales_rep':
        return 'مندوب مبيعات';
      case 'general_manager':
        return 'مدير عام';
      case 'sales_manager':
        return 'مسؤول مبيعات';
      case 'customer':
        return 'عميل';
      default:
        return roleSlug;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Consumer<AuthProvider>(
      builder: (context, authProvider, _) {
        final profiles = authProvider.linkedProfiles;
        final currentUserId = authProvider.user?.id;

        if (profiles.isEmpty) {
          return const SizedBox.shrink();
        }

        return Container(
          padding: const EdgeInsets.only(top: 16, bottom: 24),
          decoration: const BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Handle bar
              Container(
                width: 40,
                height: 4,
                margin: const EdgeInsets.only(bottom: 16),
                decoration: BoxDecoration(
                  color: Colors.grey[300],
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              const Padding(
                padding: EdgeInsets.only(left: 24, right: 24, bottom: 16),
                child: Row(
                  children: [
                    Icon(Icons.switch_account_outlined, color: Colors.white),
                    SizedBox(width: 12),
                    Text(
                      'تبديل الحساب',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ],
                ),
              ),
              const Divider(height: 1),
              Flexible(
                child: ListView.builder(
                  shrinkWrap: true,
                  itemCount: profiles.length,
                  itemBuilder: (context, index) {
                    final profile = profiles[index];
                    final isCurrent = profile['id'] == currentUserId;
                    final isParent = profile['isParent'] == true;

                    return ListTile(
                      contentPadding: const EdgeInsets.symmetric(
                        horizontal: 24,
                        vertical: 4,
                      ),
                      leading: CircleAvatar(
                        backgroundColor: isCurrent
                            ? Colors.blue.shade100
                            : Colors.grey.shade100,
                        child: Icon(
                          isParent ? Icons.business : Icons.person,
                          color: isCurrent ? Colors.blue : Colors.grey.shade600,
                        ),
                      ),
                      title: Text(
                        profile['fullName'] ?? 'بدون اسم',
                        style: TextStyle(
                          fontWeight:
                              isCurrent ? FontWeight.bold : FontWeight.normal,
                          color: isCurrent ? Colors.blue : Colors.black87,
                        ),
                      ),
                      subtitle: Text(
                        '${profile['username']} • ${_getRoleName(profile['role'] ?? '')}',
                        style: TextStyle(
                          color: Colors.grey.shade600,
                          fontSize: 12,
                        ),
                      ),
                      trailing: isCurrent
                          ? const Icon(Icons.check_circle, color: Colors.blue)
                          : null,
                      onTap: () async {
                        if (isCurrent) {
                          Navigator.of(context).pop();
                          return;
                        }

                        // Capture references before async gap
                        final navigator = Navigator.of(context);
                        final scaffold = ScaffoldMessenger.of(context);
                        final dataProvider = Provider.of<DataProvider>(context, listen: false);

                        // Close bottom sheet first
                        navigator.pop();

                        // Switch profile
                        final success = await authProvider.switchProfile(profile['id']);

                        if (success) {
                          // Clear and reload data
                          dataProvider.clearData();
                          scaffold.showSnackBar(
                            const SnackBar(
                              content: Text('تم تبديل الحساب بنجاح'),
                              backgroundColor: Colors.green,
                            ),
                          );
                        } else {
                          scaffold.showSnackBar(
                            SnackBar(
                              content: Text(authProvider.error ?? 'فشل تبديل الحساب'),
                              backgroundColor: Colors.red,
                            ),
                          );
                        }
                      },
                    );
                  },
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  static void show(BuildContext context) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => const ProfileSwitcherWidget(),
    );
  }
}
