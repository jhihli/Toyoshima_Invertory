from django.urls import path
from . import views

urlpatterns = [
    # MPNs
    path('mpns/', views.mpn_list, name='mpn-list'),
    path('mpns/<int:pk>/', views.mpn_detail, name='mpn-detail'),
    path('mpns/<int:mpn_pk>/chips/', views.mpn_chip_create, name='mpn-chip-create'),
    path('mpns/<int:mpn_pk>/chips/<int:pk>/', views.mpn_chip_detail, name='mpn-chip-detail'),
    path('mpns/<int:mpn_pk>/chips/<int:pk>/photo/', views.chip_photo, name='chip-photo'),
    path('mpns/<int:pk>/beforecut_photo/', views.mpn_beforecut_photo, name='mpn-beforecut-photo'),
    path('mpns/<int:pk>/aftercut_photo/', views.mpn_aftercut_photo, name='mpn-aftercut-photo'),

    # Vendors
    path('vendors/', views.vendor_list, name='vendor-list'),
    path('vendors/<int:pk>/', views.vendor_detail, name='vendor-detail'),

    # SOs
    path('sos/', views.so_list, name='so-list'),
    path('sos/<int:pk>/', views.so_detail, name='so-detail'),
    path('sos/<int:so_pk>/photos/', views.so_photo_upload, name='so-photo-upload'),
    path('sos/<int:so_pk>/photos/<int:pk>/', views.so_photo_delete, name='so-photo-delete'),
    path('sos/<int:so_pk>/pallets/', views.pallet_list, name='pallet-list'),
    path('sos/<int:so_pk>/pallets/<int:pk>/', views.pallet_detail, name='pallet-detail'),
    path('pallets/<int:pk>/photo/', views.pallet_photo, name='pallet-photo'),
    path('pallets/<int:pallet_pk>/photos/', views.pallet_photos_list, name='pallet-photos-list'),
    path('pallets/<int:pallet_pk>/photos/<int:pk>/', views.pallet_photo_detail, name='pallet-photo-detail'),
    path('pallets/<int:pallet_pk>/cargos/', views.cargo_list, name='cargo-list'),
    path('pallets/<int:pallet_pk>/cargos/<int:pk>/', views.cargo_detail, name='cargo-detail'),
    path('cargos/search/', views.cargo_search, name='cargo-search'),
    path('sos/<int:so_pk>/boards/', views.board_list_by_so, name='board-list-by-so'),
    path('sos/<int:so_pk>/boards/bulk/', views.board_bulk_create, name='board-bulk-create'),

    # Boards
    path('boards/<int:pk>/', views.board_detail, name='board-detail'),
    path('boards/<int:pk>/photo/', views.board_photo, name='board-photo'),
    path('boards/<int:board_pk>/chips/', views.chip_create, name='chip-create'),
    path('boards/<int:board_pk>/chips/<int:pk>/', views.chip_detail, name='chip-detail'),

    # Chip Brands
    path('chipbrands/', views.chipbrand_list, name='chipbrand-list'),
    path('chipbrands/<int:pk>/', views.chipbrand_detail, name='chipbrand-detail'),

    # Scanner (Zebra)
    path('scanner/', views.scanner_api, name='scanner-api'),
    path('scanner/vendors/', views.scanner_vendor_list, name='scanner-vendor-list'),
    path('scanner/vendors/<int:pk>/', views.scanner_vendor_detail, name='scanner-vendor-detail'),
    path('scanner/sos/<int:so_pk>/pallets/', views.scanner_so_pallets, name='scanner-so-pallets'),
    path('scanner/sos/<int:so_pk>/photos/', views.scanner_so_photo_upload, name='scanner-so-photo-upload'),
    path('scanner/boards/<int:board_pk>/photo/', views.scanner_board_photo, name='scanner-board-photo'),
    path('scanner/pallets/<int:pallet_pk>/photos/', views.scanner_pallet_photo_upload, name='scanner-pallet-photo-upload'),
    
    # Dashboard
    path('dashboard/', views.dashboard_stats, name='dashboard-stats'),

    # MPN Report Email
    path('mpn-report/config/',    views.mpn_report_config,    name='mpn-report-config'),
    path('mpn-report/last-send/', views.mpn_report_last_send, name='mpn-report-last-send'),
    path('mpn-report/send-now/',  views.mpn_report_send_now,  name='mpn-report-send-now'),

    # Pallet Chip Containers
    path('sos/<int:so_pk>/chip-containers/', views.so_chip_containers, name='so-chip-containers'),
    path('pallets/<int:pallet_pk>/chip-containers/', views.pallet_chip_container_list, name='pallet-chip-container-list'),
    path('pallets/<int:pallet_pk>/chip-containers/<int:chip_pk>/', views.pallet_chip_container_upsert, name='pallet-chip-container-upsert'),

    # Microsoft Recycling API (Buyback)
    path('msft/config/', views.msft_config, name='msft-config'),
    path('msft/meta/', views.msft_meta, name='msft-meta'),
    path('sos/<int:so_pk>/msft/job/', views.msft_job_info, name='msft-job-info'),
    path('sos/<int:so_pk>/msft/po-document/', views.msft_po_document, name='msft-po-document'),
    path('sos/<int:so_pk>/msft/credit-units/', views.msft_credit_units, name='msft-credit-units'),
    path('sos/<int:so_pk>/msft/credit-units/<int:pk>/', views.msft_credit_unit_detail, name='msft-credit-unit-detail'),
    path('sos/<int:so_pk>/msft/payment-notices/', views.msft_payment_notices, name='msft-payment-notices'),
    path('sos/<int:so_pk>/msft/payment-notices/<int:pk>/', views.msft_payment_notice_detail, name='msft-payment-notice-detail'),
    path('sos/<int:so_pk>/msft/logs/', views.msft_logs, name='msft-logs'),
    path('sos/<int:so_pk>/msft/push/', views.msft_push, name='msft-push'),
]
