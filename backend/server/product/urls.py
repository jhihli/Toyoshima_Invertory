from django.urls import path
from . import views

urlpatterns = [
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
    path('sos/<int:so_pk>/boards/', views.board_list_by_so, name='board-list-by-so'),

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
    path('scanner/sos/<int:so_pk>/photos/', views.scanner_so_photo_upload, name='scanner-so-photo-upload'),
    path('scanner/boards/<int:board_pk>/photo/', views.scanner_board_photo, name='scanner-board-photo'),

    # Dashboard
    path('dashboard/', views.dashboard_stats, name='dashboard-stats'),
]
