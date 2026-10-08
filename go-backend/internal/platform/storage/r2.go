package storage

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
	"github.com/aws/smithy-go"
)

// R2 以 S3 兼容协议访问 R2，凭据仅保存在客户端配置中。
type R2 struct {
	Client *s3.Client
	Bucket string
}

// NewR2 创建具有固定超时和签名策略的 R2 客户端。
func NewR2(endpoint, bucket, key, secret string) (*R2, error) {
	if endpoint == "" || bucket == "" || key == "" || secret == "" {
		return nil, fmt.Errorf("R2 configuration incomplete")
	}
	cfg := aws.Config{
		Region:                     "auto",
		Credentials:                aws.NewCredentialsCache(credentials.NewStaticCredentialsProvider(key, secret, "")),
		HTTPClient:                 &http.Client{Timeout: 15 * time.Second},
		RequestChecksumCalculation: aws.RequestChecksumCalculationWhenRequired,
		ResponseChecksumValidation: aws.ResponseChecksumValidationWhenRequired,
	}
	client := s3.NewFromConfig(cfg, func(o *s3.Options) { o.BaseEndpoint = &endpoint; o.UsePathStyle = true })
	return &R2{Client: client, Bucket: bucket}, nil
}

// Put 写入指定 key 的对象，尊重请求取消和提供者超时。
func (r *R2) Put(ctx context.Context, key string, b []byte, mime string) error {
	_, err := r.Client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:      &r.Bucket,
		Key:         &key,
		Body:        bytes.NewReader(b),
		ContentType: &mime,
	})
	return err
}

// Get 读取指定 key 的对象，读完后关闭响应流。
func (r *R2) Get(ctx context.Context, key string) ([]byte, error) {
	res, err := r.Client.GetObject(ctx, &s3.GetObjectInput{Bucket: &r.Bucket, Key: &key})
	if err != nil {
		var missing *types.NoSuchKey
		var api smithy.APIError
		if errors.As(err, &missing) || (errors.As(err, &api) && api.ErrorCode() == "NotFound") {
			return nil, nil
		}
		return nil, err
	}
	defer res.Body.Close()
	return io.ReadAll(io.LimitReader(res.Body, 10485761))
}

// Delete 删除指定 key 的对象；共享引用判断由附件服务负责。
func (r *R2) Delete(ctx context.Context, key string) error {
	_, err := r.Client.DeleteObject(ctx, &s3.DeleteObjectInput{Bucket: &r.Bucket, Key: &key})
	return err
}
