from django.urls import path
from . import views

urlpatterns = [
    # MPNs
    path('mpns/', views.mpn_list, name='mpn-list'),
    path('mpns/bulk-status/', views.mpn_bulk_status, name='mpn-bulk-status'),
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
    path('pallets/<int:pallet_pk>/boxes/', views.box_list, name='box-list'),
    path('pallets/<int:pallet_pk>/boxes/<int:pk>/', views.box_detail, name='box-detail'),
    path('boxes/search/', views.box_search, name='box-search'),
    path('pallets/<int:pallet_pk>/checklists/', views.checklist_list, name='checklist-list'),
    path('pallets/<int:pallet_pk>/checklists/<int:pk>/', views.checklist_detail, name='checklist-detail'),
    path('checklists/search/', views.checklist_search, name='checklist-search'),
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
    path('scanner/pallets/lookup/', views.scanner_pallet_lookup, name='scanner-pallet-lookup'),
    path('scanner/pallets/<int:pallet_pk>/boxes/bulk/', views.scanner_box_bulk_create, name='scanner-box-bulk-create'),
    path('scanner/pallets/<int:pallet_pk>/boxes/', views.scanner_box_list, name='scanner-box-list'),
    path('scanner/pallets/<int:pallet_pk>/checklists/bulk/', views.scanner_checklist_bulk_create, name='scanner-checklist-bulk-create'),
    path('scanner/pallets/<int:pallet_pk>/checklists/', views.scanner_checklist_list, name='scanner-checklist-list'),
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
]

# The Microsoft Recycling API (Buyback) feature is local-only: its package is
# gitignored and absent from the production server, which is deliberate - the
# integration holds Entra ID credentials that must not sit on an
# internet-facing box. See docs/MSFT_LOCAL.md. Where the package exists the
# routes are wired in; where it does not, the endpoints simply do not exist.
try:
    from .msft.urls import urlpatterns as msft_urlpatterns
except ImportError:
    pass
else:
    urlpatterns += msft_urlpatterns
