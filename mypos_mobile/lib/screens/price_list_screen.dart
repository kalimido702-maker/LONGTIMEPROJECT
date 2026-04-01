import 'package:flutter/material.dart';
import 'package:pdfx/pdfx.dart';
import 'package:dio/dio.dart';
import 'package:path_provider/path_provider.dart';
import '../config/theme.dart';
import '../services/api_service.dart';
import '../config/api_config.dart';

class PriceListScreen extends StatefulWidget {
  const PriceListScreen({super.key});

  @override
  State<PriceListScreen> createState() => _PriceListScreenState();
}

class _PriceListScreenState extends State<PriceListScreen> {
  PdfControllerPinch? _pdfController;
  bool _loading = true;
  String? _error;
  int _totalPages = 0;
  int _currentPage = 0;

  @override
  void initState() {
    super.initState();
    _loadPdf();
  }

  @override
  void dispose() {
    _pdfController?.dispose();
    super.dispose();
  }

  Future<void> _loadPdf() async {
    try {
      setState(() {
        _loading = true;
        _error = null;
      });

      final api = ApiService();
      final res = await api.get(ApiConfig.priceList);

      if (res.data['exists'] != true || res.data['url'] == null) {
        if (mounted) {
          setState(() {
            _error = 'لا توجد لستة أسعار متاحة';
            _loading = false;
          });
        }
        return;
      }

      final url = res.data['url'] as String;
      final dir = await getTemporaryDirectory();
      final filePath = '${dir.path}/price_list.pdf';
      await Dio().download(url, filePath);

      if (mounted) {
        final controller = PdfControllerPinch(
          document: PdfDocument.openFile(filePath),
        );
        setState(() {
          _pdfController = controller;
          _loading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = 'فشل تحميل لستة الأسعار';
          _loading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('لستة الاسعار'),
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
        actions: [
          if (_totalPages > 0)
            Center(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Text(
                  '${_currentPage} / $_totalPages',
                  style: const TextStyle(fontSize: 14, color: Colors.white70),
                ),
              ),
            ),
        ],
      ),
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    if (_loading) {
      return const Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            CircularProgressIndicator(color: AppColors.primary),
            SizedBox(height: 16),
            Text('جاري تحميل لستة الأسعار...'),
          ],
        ),
      );
    }

    if (_error != null) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.error_outline, size: 48, color: AppColors.error),
            const SizedBox(height: 16),
            Text(_error!, style: const TextStyle(fontSize: 16)),
            const SizedBox(height: 16),
            ElevatedButton.icon(
              onPressed: _loadPdf,
              icon: const Icon(Icons.refresh),
              label: const Text('إعادة المحاولة'),
            ),
          ],
        ),
      );
    }

    if (_pdfController == null) return const SizedBox.shrink();

    return PdfViewPinch(
      controller: _pdfController!,
      onDocumentLoaded: (document) {
        if (mounted) setState(() => _totalPages = document.pagesCount);
      },
      onPageChanged: (page) {
        if (mounted) setState(() => _currentPage = page);
      },
    );
  }
}
