import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:lucide_icons/lucide_icons.dart';
import '../providers/auth_provider.dart';
import '../services/api_service.dart';
import '../config/theme.dart';
import '../widgets/profile_switcher_widget.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  final _usernameController = TextEditingController();
  final _formKey = GlobalKey<FormState>();
  bool _isLoading = false;

  @override
  void initState() {
    super.initState();
    final user = context.read<AuthProvider>().user;
    if (user != null) {
      _usernameController.text = user.username;
    }
  }

  @override
  void dispose() {
    _usernameController.dispose();
    super.dispose();
  }

  Future<void> _updateProfile() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() => _isLoading = true);
    
    try {
      final api = ApiService();
      await api.updateProfile(username: _usernameController.text.trim());
      
      if (!mounted) return;
      
      // Attempt to refresh the user session through auth provider to get the new username 
      context.read<AuthProvider>().updateLocalUsername(_usernameController.text.trim());
      
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('تم تحديث الملف الشخصي بنجاح'),
          backgroundColor: Colors.green,
        ),
      );
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('$e'),
          backgroundColor: Colors.red,
        ),
      );
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = context.watch<AuthProvider>().user;
    if (user == null) return const Scaffold();

    return Scaffold(
      appBar: AppBar(
        title: const Text('الملف الشخصي'),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const CircleAvatar(
                radius: 40,
                backgroundColor: AppColors.primaryLight,
                child: Icon(LucideIcons.user, size: 40, color: AppColors.primary),
              ),
              const SizedBox(height: 24),
              // Name (readonly)
              buildTextField(
                label: 'الاسم الكامل',
                initialValue: user.fullName,
                readOnly: true,
              ),
              const SizedBox(height: 16),
              // Role (readonly)
              buildTextField(
                label: 'الدور',
                initialValue: _getRoleLabel(user.role),
                readOnly: true,
              ),
              const SizedBox(height: 16),
              // Username (editable)
              TextFormField(
                controller: _usernameController,
                decoration: InputDecoration(
                  labelText: 'اسم المستخدم',
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                  prefixIcon: const Icon(LucideIcons.userCircle),
                ),
                validator: (val) {
                  if (val == null || val.trim().isEmpty) {
                    return 'اسم المستخدم مطلوب';
                  }
                  return null;
                },
              ),
              const SizedBox(height: 32),
              ElevatedButton(
                onPressed: _isLoading ? null : _updateProfile,
                style: ElevatedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  backgroundColor: AppColors.primary,
                  foregroundColor: Colors.white,
                ),
                child: _isLoading 
                    ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                    : const Text('حفظ التغييرات', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
              ),
              if (context.watch<AuthProvider>().linkedProfiles.length > 1) ...[
                const SizedBox(height: 16),
                OutlinedButton.icon(
                  onPressed: () => ProfileSwitcherWidget.show(context),
                  icon: const Icon(Icons.switch_account_outlined),
                  label: const Text('تبديل الحساب', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                  style: OutlinedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    side: const BorderSide(color: AppColors.primary),
                    foregroundColor: AppColors.primary,
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget buildTextField({required String label, required String initialValue, bool readOnly = false}) {
    return TextFormField(
      initialValue: initialValue,
      readOnly: readOnly,
      decoration: InputDecoration(
        labelText: label,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
        filled: readOnly,
        fillColor: readOnly ? Colors.grey[100] : null,
      ),
    );
  }

  String _getRoleLabel(String? r) {
    if (r == null) return '';
    if (r == 'admin') return 'مدير النظام';
    if (r == 'supervisor') return 'مشرف';
    if (r == 'sales_rep' || r == 'salesman' || r == 'salesRep') return 'مندوب مبيعات';
    if (r == 'customer') return 'عميل';
    return 'موظف';
  }
}
