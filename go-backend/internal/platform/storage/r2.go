package storage

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
	"github.com/aws/smithy-go"
	"io"
	"net/http"
	"time"
)

type R2 struct {
	Client *s3.Client
	Bucket string
}

func NewR2(endpoint, bucket, key, secret string) (*R2, error) {
	if endpoint == "" || bucket == "" || key == "" || secret == "" {
		return nil, fmt.Errorf("R2 configuration incomplete")
	}
	cfg := aws.Config{Region: "auto", Credentials: aws.NewCredentialsCache(credentials.NewStaticCredentialsProvider(key, secret, "")), HTTPClient: &http.Client{Timeout: 15 * time.Second}, RequestChecksumCalculation: aws.RequestChecksumCalculationWhenRequired, ResponseChecksumValidation: aws.ResponseChecksumValidationWhenRequired}
	client := s3.NewFromConfig(cfg, func(o *s3.Options) { o.BaseEndpoint = &endpoint; o.UsePathStyle = true })
	return &R2{Client: client, Bucket: bucket}, nil
}
func (r *R2) Put(ctx context.Context, key string, b []byte, mime string) error {
	_, e := r.Client.PutObject(ctx, &s3.PutObjectInput{Bucket: &r.Bucket, Key: &key, Body: bytes.NewReader(b), ContentType: &mime})
	return e
}
func (r *R2) Get(ctx context.Context, key string) ([]byte, error) {
	res, e := r.Client.GetObject(ctx, &s3.GetObjectInput{Bucket: &r.Bucket, Key: &key})
	if e != nil {
		var missing *types.NoSuchKey
		var api smithy.APIError
		if errors.As(e, &missing) || (errors.As(e, &api) && api.ErrorCode() == "NotFound") {
			return nil, nil
		}
		return nil, e
	}
	defer res.Body.Close()
	return io.ReadAll(io.LimitReader(res.Body, 10485761))
}
func (r *R2) Delete(ctx context.Context, key string) error {
	_, e := r.Client.DeleteObject(ctx, &s3.DeleteObjectInput{Bucket: &r.Bucket, Key: &key})
	return e
}
